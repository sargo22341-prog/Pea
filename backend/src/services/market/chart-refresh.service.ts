import { db } from "../../db.js";
import { config } from "../../config.js";
import type { RangeKey } from "@pea/shared";
import { assetRepository } from "./asset.repository.js";
import { chartConfigService } from "./chart-config.service.js";
import { marketDataService } from "./market-data.service.js";
import { marketEventsService } from "./market-events.service.js";
import { logger } from "../shared/logger.service.js";

type RefreshStatus = "disabled" | "skipped-fresh" | "in-progress" | "started" | "unsupported-range" | "not-found";

export class ChartRefreshService {
  requestAssetRefresh(input: { userId: string | number; symbol: string; range: RangeKey; scope: "asset" | "watchlist" | "portfolio" }) {
    if (!config.enableMarketLiveRefresh) return { status: "disabled" as RefreshStatus };
    if (input.range !== "1d") return { status: "unsupported-range" as RefreshStatus };
    const asset = assetRepository.findBySymbol(input.symbol.toUpperCase());
    if (!asset) return { status: "not-found" as RefreshStatus };

    const thresholdMs = chartConfigService.getLazyChartRefreshThresholdMs();
    if (!marketDataService.chartNeedsRefresh(asset, thresholdMs)) return { status: "skipped-fresh" as RefreshStatus };
    if (marketDataService.isIntradayRefreshInFlight(asset.symbol)) return { status: "in-progress" as RefreshStatus };

    const startedAt = new Date().toISOString();
    const startedEvent = input.scope === "portfolio" ? "portfolio-chart-refresh-started" : input.scope === "watchlist" ? "watchlist-chart-refresh-started" : "asset-chart-refresh-started";
    const updatedEvent = input.scope === "portfolio" ? "portfolio-chart-updated" : input.scope === "watchlist" ? "watchlist-chart-updated" : "asset-chart-updated";
    marketEventsService.emitToUser(input.userId, startedEvent, { symbol: asset.symbol, range: input.range, startedAt });

    void marketDataService.refreshLiveIntradayForAsset(asset)
      .then(() => {
        marketEventsService.emitToUser(input.userId, updatedEvent, { symbol: asset.symbol, range: input.range, updatedAt: new Date().toISOString() });
      })
      .catch((error) => {
        logger.warn("market-data", "lazy chart refresh failed", { symbol: asset.symbol, error: error instanceof Error ? error.message : String(error) });
      });

    return { status: "started" as RefreshStatus };
  }

  requestWatchlistRefresh(input: { userId: string | number; range: RangeKey }) {
    if (!config.enableMarketLiveRefresh) return { status: "disabled" as RefreshStatus };
    const rows = db.prepare("SELECT symbol FROM watchlist WHERE user_id = ?").all(String(input.userId)) as Array<{ symbol: string }>;
    const results = rows.map((row) => this.requestAssetRefresh({ userId: input.userId, symbol: row.symbol, range: input.range, scope: "watchlist" }));
    return {
      status: results.some((result) => result.status === "started") ? "started" as RefreshStatus : "skipped-fresh" as RefreshStatus,
      symbols: rows.map((row) => row.symbol)
    };
  }

  requestPortfolioRefresh(input: { userId: string | number; range: RangeKey }) {
    if (!config.enableMarketLiveRefresh) return { status: "disabled" as RefreshStatus };
    const rows = db.prepare("SELECT symbol FROM positions WHERE user_id = ?").all(String(input.userId)) as Array<{ symbol: string }>;
    const results = rows.map((row) => this.requestAssetRefresh({ userId: input.userId, symbol: row.symbol, range: input.range, scope: "portfolio" }));
    return {
      status: results.some((result) => result.status === "started") ? "started" as RefreshStatus : "skipped-fresh" as RefreshStatus,
      symbols: rows.map((row) => row.symbol)
    };
  }

}

export const chartRefreshService = new ChartRefreshService();
