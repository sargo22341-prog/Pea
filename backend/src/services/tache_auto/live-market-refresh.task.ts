import type { Quote } from "@pea/shared";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { runWithUser } from "../auth/user-context.js";
import { assetRepository, type AssetRow } from "../market/asset.repository.js";
import { chartConfigService } from "../market/chart-config.service.js";
import { marketDataService } from "../market/market-data.service.js";
import { marketEventsService } from "../market/market-events.service.js";
import { marketSnapshotService } from "../market/market-snapshot.service.js";
import { watchlistService } from "../assets/watchlist.service.js";
import { dividendService } from "../portfolio/dividend.service.js";
import { portfolioAnalysisService } from "../portfolio/portfolio-analysis.service.js";
import { portfolioService } from "../portfolio/portfolio.service.js";
import { frontendBlockCache } from "../shared/frontend-block-cache.service.js";
import { logger } from "../shared/logger.service.js";
import { yahooApi } from "../yahoo/yahoo.api.js";
import type { YahooSnapshotPayload } from "../yahoo/yahoo.mapper.js";
import { getSessionsForDate } from "../market/getMarketCalendar.js";
import { zonedTimeToUtc } from "../timezone/date-time.service.js";
import { marketRunRepository, type MarketDailyRunRow } from "./market-run.repository.js";
import { localTradingDate, type MarketAssetGroup } from "./market-task.utils.js";

const confirmedOpenStatuses = new Set(["confirmed_open", "confirmed_open_partial"]);
const closedStatuses = new Set(["confirmed_closed", "confirmed_closed_partial"]);
const chunkSize = 250;

interface EligibleMarket {
  group: MarketAssetGroup;
  run: MarketDailyRunRow;
  symbols: string[];
}

interface BatchRow {
  quote: Quote;
  snapshot: YahooSnapshotPayload;
}

export class LiveMarketRefreshTask {
  private lastRunAt = 0;

  async run(groups: Iterable<MarketAssetGroup>, now = new Date()) {
    if (!config.enableMarketLiveRefresh) return { enabled: false, updated: 0, yahooCalls: 0 };
    const snapshotsIntervalMs = chartConfigService.getSnapshotRefreshIntervalMs();
    if (now.getTime() - this.lastRunAt < snapshotsIntervalMs) return { enabled: true, updated: 0, yahooCalls: 0, skipped: "interval" };
    this.lastRunAt = now.getTime();

    const eligible = [...groups].map((group) => this.eligibleMarket(group, now)).filter((item): item is EligibleMarket => Boolean(item));
    const allSymbols = [...new Set(eligible.flatMap((item) => item.symbols))];
    if (!eligible.length || !allSymbols.length) return { enabled: true, updated: 0, yahooCalls: 0 };

    let rows: BatchRow[];
    let yahooCalls = 0;
    try {
      const chunks = this.chunks(allSymbols);
      yahooCalls += chunks.length;
      rows = (await Promise.all(chunks.map((symbols) => yahooApi.quoteBatchRaw(symbols)))).flat();
    } catch (error) {
      logger.warn("market-data", "global live market refresh failed, falling back by market", {
        symbols: allSymbols.length,
        error: error instanceof Error ? error.message : String(error)
      });
      const fallback = await this.fetchByMarket(eligible);
      rows = fallback.rows;
      yahooCalls += fallback.yahooCalls;
    }

    const rowsBySymbol = new Map(rows.map((row) => [row.quote.symbol.toUpperCase(), row]));
    const emptyMarkets = eligible.filter((market) => !market.symbols.some((symbol) => rowsBySymbol.has(symbol.toUpperCase())));
    if (rows.length > 0 && emptyMarkets.length > 0) {
      const fallback = await this.fetchByMarket(emptyMarkets);
      yahooCalls += fallback.yahooCalls;
      for (const row of fallback.rows) rowsBySymbol.set(row.quote.symbol.toUpperCase(), row);
    }

    const symbolsToAsset = new Map<string, AssetRow>();
    const symbolsToMarket = new Map<string, string>();
    for (const market of eligible) {
      for (const asset of market.group.assets) {
        const key = asset.symbol.toUpperCase();
        if (!market.symbols.includes(key)) continue;
        symbolsToAsset.set(key, asset);
        symbolsToMarket.set(key, market.group.marketKey);
      }
    }

    const updatedSymbols: string[] = [];
    for (const [symbol, row] of rowsBySymbol) {
      const asset = assetRepository.findBySymbol(symbol) ?? symbolsToAsset.get(symbol);
      if (!asset) continue;
      marketSnapshotService.storeBatchSnapshot(asset, row.quote, row.snapshot, snapshotsIntervalMs);
      updatedSymbols.push(asset.symbol);
    }

    const portfolioAssets = this.portfolioAssetsForSymbols(updatedSymbols);
    const chartResult = await marketDataService.refreshLiveIntradayForAssets(portfolioAssets, now, {
      minAgeMs: chartConfigService.getPortfolioChartRefreshIntervalMs()
    }).catch((error) => {
      logger.warn("market-data", "live intraday chart refresh failed", { error: error instanceof Error ? error.message : String(error) });
      return { updated: 0, yahooCalls: 0 };
    });
    yahooCalls += chartResult.yahooCalls;
    await this.prewarmFrontendBlocks(updatedSymbols);

    if (updatedSymbols.length > 0) {
      const markets = [...new Set(updatedSymbols.map((symbol) => symbolsToMarket.get(symbol.toUpperCase())).filter((market): market is string => Boolean(market)))];
      marketEventsService.emitMarketRefresh({ markets, symbols: updatedSymbols, updatedAt: now.toISOString() });
    }

    logger.info("market-data", "live market refresh completed", {
      markets: eligible.map((item) => item.group.marketKey).join(","),
      symbols: allSymbols.length,
      updated: updatedSymbols.length,
      intradayCandles: chartResult.updated,
      yahooCalls
    });
    return { enabled: true, updated: updatedSymbols.length, yahooCalls };
  }

  private async prewarmFrontendBlocks(symbols: string[]) {
    for (const [userId, impact] of this.userImpactsForSymbols(symbols)) {
      await runWithUser(Number(userId), async () => {
        if (impact.portfolio) {
          frontendBlockCache.invalidate({ userId, block: "portfolio-summary" });
          frontendBlockCache.invalidate({ userId, block: "analysis" });
          frontendBlockCache.invalidate({ userId, block: "dividends" });
          db.prepare("DELETE FROM portfolio_chart_cache WHERE user_id = ?").run(String(userId));
          db.prepare("DELETE FROM portfolio_positions_performance_cache WHERE user_id = ? AND range = '1d'").run(String(userId));
        }
        if (impact.watchlist) frontendBlockCache.invalidate({ userId, block: "watchlist" });
        const tasks: Array<Promise<unknown>> = [];
        if (impact.portfolio) tasks.push(
          portfolioService.summary("1d").catch(() => undefined),
          portfolioService.chart("1d", userId).catch(() => undefined),
          portfolioService.positionsPerformance("1d").catch(() => undefined),
          portfolioAnalysisService.analysis().catch(() => undefined),
          dividendService.portfolioDividends().catch(() => undefined)
        );
        if (impact.watchlist) tasks.push(watchlistService.list("1d").catch(() => undefined));
        await Promise.all(tasks);
      });
    }
  }

  private userImpactsForSymbols(symbols: string[]) {
    const keys = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
    const result = new Map<string, { portfolio: boolean; watchlist: boolean }>();
    if (!keys.length) return result;
    const placeholders = keys.map(() => "?").join(",");
    const positions = db.prepare(`SELECT DISTINCT user_id FROM positions WHERE symbol IN (${placeholders})`).all(...keys) as Array<{ user_id: string | number }>;
    for (const row of positions) {
      const userId = String(row.user_id);
      result.set(userId, { ...(result.get(userId) ?? { portfolio: false, watchlist: false }), portfolio: true });
    }
    const watchlist = db.prepare(`SELECT DISTINCT user_id FROM watchlist WHERE symbol IN (${placeholders})`).all(...keys) as Array<{ user_id: string | number }>;
    for (const row of watchlist) {
      const userId = String(row.user_id);
      result.set(userId, { ...(result.get(userId) ?? { portfolio: false, watchlist: false }), watchlist: true });
    }
    return result;
  }

  private eligibleMarket(group: MarketAssetGroup, now: Date): EligibleMarket | undefined {
    if (!group.assets.length) return undefined;
    const local = localTradingDate(now, group.calendar.timezone);
    const run = marketRunRepository.get(group.marketKey, local.isoDate);
    if (!run) return undefined;
    if (run.assets_count <= 0 || !confirmedOpenStatuses.has(run.open_status) || closedStatuses.has(run.close_status)) return undefined;
    const snapshotsIntervalMs = chartConfigService.getSnapshotRefreshIntervalMs();
    if (run.open_confirmed_at && now.getTime() - new Date(run.open_confirmed_at).getTime() < snapshotsIntervalMs) return undefined;
    if (!this.isActiveSession(group, local.isoDate, now)) return undefined;
    if (run.close_expected_at && now.getTime() >= new Date(run.close_expected_at).getTime() - snapshotsIntervalMs) return undefined;
    return {
      group,
      run,
      symbols: [...new Set(group.assets.map((asset) => asset.symbol.toUpperCase()))]
    };
  }

  private isActiveSession(group: MarketAssetGroup, tradingDate: string, now: Date) {
    const sessions = getSessionsForDate(group.calendar, tradingDate);
    return sessions.some((session) => {
      const open = zonedTimeToUtc(tradingDate, session.openTime, group.calendar.timezone).getTime();
      const close = zonedTimeToUtc(tradingDate, session.closeTime, group.calendar.timezone).getTime();
      return now.getTime() >= open && now.getTime() < close;
    });
  }

  private async fetchByMarket(markets: EligibleMarket[]) {
    const rows: BatchRow[] = [];
    let yahooCalls = 0;
    for (const market of markets) {
      for (const symbols of this.chunks(market.symbols)) {
        yahooCalls += 1;
        rows.push(...await yahooApi.quoteBatchRaw(symbols));
      }
    }
    return { rows, yahooCalls };
  }

  private portfolioAssetsForSymbols(symbols: string[]) {
    const keys = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
    if (!keys.length) return [];
    const placeholders = keys.map(() => "?").join(",");
    const rows = db.prepare(`SELECT DISTINCT symbol FROM positions WHERE symbol IN (${placeholders})`).all(...keys) as Array<{ symbol: string }>;
    return rows.map((row) => assetRepository.findBySymbol(row.symbol)).filter((asset): asset is AssetRow => Boolean(asset));
  }

  private chunks(symbols: string[]) {
    const result: string[][] = [];
    for (let index = 0; index < symbols.length; index += chunkSize) {
      result.push(symbols.slice(index, index + chunkSize));
    }
    return result;
  }
}

export const liveMarketRefreshTask = new LiveMarketRefreshTask();
