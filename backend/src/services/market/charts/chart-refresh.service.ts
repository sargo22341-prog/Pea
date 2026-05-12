import { db } from "../../../db.js";
import type { RangeKey } from "@pea/shared";
import { assetRepository } from "../../../repositories/market/asset.repository.js";
import type { AssetRow } from "../../../repositories/market/asset.repository.js";
import { chartConfigService } from "./chart-config.service.js";
import { marketDataService } from "../data/market-data.service.js";
import { marketEventsService } from "../events/market-events.service.js";
import { logger } from "../../shared/logger.service.js";
import { marketRunRepository } from "../../../repositories/market/market-run.repository.js";
import { groupAssetsByMarket, localTradingDate } from "../../../schedulers/market-task.utils.js";

type RefreshStatus = "skipped-fresh" | "skipped-market-closed" | "in-progress" | "started" | "unsupported-range" | "not-found";

const confirmedOpenStatuses = new Set(["confirmed_open", "confirmed_open_partial"]);
const blockedCloseStatuses = new Set(["confirmed_closed", "confirmed_closed_partial", "close_not_confirmed", "skipped_weekend", "skipped_no_assets"]);

export class ChartRefreshService {
  requestAssetRefresh(input: { userId: string | number; symbol: string; range: RangeKey; scope: "asset" | "watchlist" | "portfolio"; force?: boolean }) {
    if (input.range !== "1d") return { status: "unsupported-range" as RefreshStatus };
    const asset = assetRepository.findBySymbol(input.symbol.toUpperCase());
    if (!asset) return { status: "not-found" as RefreshStatus };

    const [eligible] = this.filterRefreshableAssets([asset], { force: Boolean(input.force) });
    if (!eligible) return { status: "skipped-market-closed" as RefreshStatus };
    return this.startRefresh({ ...input, asset: eligible });
  }

  async requestAssetRefreshWithInitialization(input: { userId: string | number; symbol: string; range: RangeKey; scope: "asset" | "watchlist" | "portfolio"; force?: boolean }) {
    if (input.range !== "1d") return { status: "unsupported-range" as RefreshStatus };
    const asset = assetRepository.findBySymbol(input.symbol.toUpperCase()) ?? await marketDataService.ensureAssetInitialized(input.symbol.toUpperCase()).catch(() => undefined);
    if (!asset) return { status: "not-found" as RefreshStatus };

    const [eligible] = this.filterRefreshableAssets([asset], { force: Boolean(input.force) });
    if (!eligible) return { status: "skipped-market-closed" as RefreshStatus };
    return this.startRefresh({ ...input, asset: eligible });
  }

  private startRefresh(input: { userId: string | number; asset: AssetRow; range: RangeKey; scope: "asset" | "watchlist" | "portfolio"; force?: boolean }) {
    const thresholdMs = input.force ? 0 : chartConfigService.getIntradayRefreshIntervalMs();
    if (!input.force && !marketDataService.chartNeedsRefresh(input.asset, thresholdMs)) return { status: "skipped-fresh" as RefreshStatus };
    if (marketDataService.isIntradayRefreshInFlight(input.asset.symbol)) return { status: "in-progress" as RefreshStatus };

    const startedAt = new Date().toISOString();
    const startedEvent = input.scope === "portfolio" ? "portfolio-chart-refresh-started" : input.scope === "watchlist" ? "watchlist-chart-refresh-started" : "asset-chart-refresh-started";
    const updatedEvent = input.scope === "portfolio" ? "portfolio-chart-updated" : input.scope === "watchlist" ? "watchlist-chart-updated" : "asset-chart-updated";
    marketEventsService.emitToUser(input.userId, startedEvent, { symbol: input.asset.symbol, range: input.range, startedAt });

    void marketDataService.refreshLiveIntradayForAsset(input.asset)
      .then(() => {
        marketEventsService.emitToUser(input.userId, updatedEvent, { symbol: input.asset.symbol, range: input.range, updatedAt: new Date().toISOString() });
      })
      .catch((error) => {
        logger.warn("market-data", "lazy chart refresh failed", { symbol: input.asset.symbol, error: error instanceof Error ? error.message : String(error) });
      });

    return { status: "started" as RefreshStatus };
  }

  requestWatchlistRefresh(input: { userId: string | number; range: RangeKey; force?: boolean }) {
    if (input.range !== "1d") return { status: "unsupported-range" as RefreshStatus, symbols: [] };
    const rows = db.prepare("SELECT symbol FROM watchlist WHERE user_id = ?").all(String(input.userId)) as Array<{ symbol: string }>;
    const assets = rows.map((row) => assetRepository.findBySymbol(row.symbol)).filter((asset): asset is AssetRow => Boolean(asset));
    const eligibleAssets = this.filterRefreshableAssets(assets, { force: Boolean(input.force) });
    const results = eligibleAssets.map((asset) => this.startRefresh({ userId: input.userId, asset, range: input.range, scope: "watchlist", force: input.force }));
    return {
      status: results.some((result) => result.status === "started")
        ? "started" as RefreshStatus
        : results.some((result) => result.status === "in-progress")
          ? "in-progress" as RefreshStatus
          : eligibleAssets.length === 0 && assets.length > 0
            ? "skipped-market-closed" as RefreshStatus
            : "skipped-fresh" as RefreshStatus,
      symbols: eligibleAssets.map((asset) => asset.symbol)
    };
  }

  requestPortfolioRefresh(input: { userId: string | number; range: RangeKey; force?: boolean }) {
    if (input.range !== "1d") return { status: "unsupported-range" as RefreshStatus, symbols: [] };
    const rows = db.prepare("SELECT symbol FROM positions WHERE user_id = ?").all(String(input.userId)) as Array<{ symbol: string }>;
    const assets = rows.map((row) => assetRepository.findBySymbol(row.symbol)).filter((asset): asset is AssetRow => Boolean(asset));
    const eligibleAssets = this.filterRefreshableAssets(assets, { force: Boolean(input.force) });
    const results = eligibleAssets.map((asset) => this.startRefresh({ userId: input.userId, asset, range: input.range, scope: "portfolio", force: input.force }));
    return {
      status: results.some((result) => result.status === "started")
        ? "started" as RefreshStatus
        : results.some((result) => result.status === "in-progress")
          ? "in-progress" as RefreshStatus
          : eligibleAssets.length === 0 && assets.length > 0
            ? "skipped-market-closed" as RefreshStatus
            : "skipped-fresh" as RefreshStatus,
      symbols: eligibleAssets.map((asset) => asset.symbol)
    };
  }

  private filterRefreshableAssets(assets: AssetRow[], options: { force: boolean; now?: Date }) {
    if (options.force) return assets;
    const now = options.now ?? new Date();
    const groups = groupAssetsByMarket(assets);
    const eligible: AssetRow[] = [];

    for (const group of groups.values()) {
      const local = localTradingDate(now, group.calendar.timezone);
      const run = marketRunRepository.get(group.marketKey, local.isoDate);
      const marketConfirmedOpen = Boolean(run && confirmedOpenStatuses.has(run.open_status) && !blockedCloseStatuses.has(run.close_status));

      for (const asset of group.assets) {
        if (marketConfirmedOpen || !this.hasAnyChartData(asset.id)) {
          eligible.push(asset);
        } else {
          logger.debug("market-data", "lazy chart refresh skipped because market is not confirmed open", {
            symbol: asset.symbol,
            marketKey: group.marketKey,
            tradingDate: local.isoDate,
            openStatus: run?.open_status ?? "missing_run",
            closeStatus: run?.close_status ?? "missing_run"
          });
        }
      }
    }

    return eligible;
  }

  private hasAnyChartData(assetId: number) {
    const tables = ["chart_candles_1d", "chart_candles_1w", "chart_candles_1m", "chart_candles_all"];
    return tables.some((table) => {
      const row = db.prepare(`SELECT 1 AS found FROM ${table} WHERE asset_id = ? LIMIT 1`).get(assetId) as { found?: number } | undefined;
      return Boolean(row);
    });
  }

}

export const chartRefreshService = new ChartRefreshService();
