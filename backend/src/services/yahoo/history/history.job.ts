/**
 * Role du fichier : orchestrer le job historique Yahoo, du choix de session
 * marche jusqu'a la sanitation et l'ecriture cache.
 */

import type { HistoryPoint, Quote, RangeKey } from "@pea/shared";
import { buildHistoricalOptions } from "../../../utils/range.js";
import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { getLastTradingDay, shouldRefreshMarketData } from "../../market/calendars/marketCalendar.service.js";
import { dedupeInFlight } from "../../shared/inFlightDeduper.js";
import { logger } from "../../shared/logger.service.js";
import { readHistoryCache, readIntradayCache, readLatestIntradayCache, writeHistoryCache, writeIntradayCache } from "../cache/history.cache.js";
import { safeYahooCall, yahooClient } from "../yahoo.client.js";
import { logMarketData } from "../utils/logging.js";
import { markStaleList } from "../utils/stale.js";
import { aggregateHistoryPoints, mapChartRows } from "./history.mapper.js";
import { sanitizeHistoryPoints } from "./history.sanitizer.js";

export type QuoteReader = (symbol: string) => Promise<MarketDataResult<Quote>>;

/** Recupere les points historiques pour une range en conservant les special cases 1d/1w. */
export async function fetchHistory(symbol: string, range: RangeKey, quoteReader: QuoteReader): Promise<MarketDataResult<HistoryPoint[]>> {
  const key = symbol.toUpperCase();
  let quoteForRange: Quote | undefined;
  if (range === "1d") {
    try {
      quoteForRange = (await quoteReader(key)).data;
    } catch {
      quoteForRange = undefined;
    }
  }

  const marketSession = range === "1d" ? getLastTradingDay(key, quoteForRange?.exchange) : undefined;
  const historicalOptions = buildHistoricalOptions(range, {
    symbol: key,
    exchange: quoteForRange?.exchange,
    fullExchangeName: quoteForRange?.exchange,
    period1: marketSession?.period1,
    period2: marketSession?.period2
  });
  if (marketSession) {
    historicalOptions.tradingDay = marketSession.date;
    historicalOptions.period1 = marketSession.period1;
    historicalOptions.period2 = new Date(Math.min(marketSession.period2.getTime(), Date.now()));
  }

  const displayInterval = String(historicalOptions.displayInterval);
  logger.debug("chart", "history fetch requested", { symbol: key, range, interval: historicalOptions.interval, displayInterval, tradingDay: historicalOptions.tradingDay });
  const historyTtlSeconds = range === "1w" ? 15 * 60 : 60 * 60;
  const cacheReader = range === "1d" ? () => readIntradayCache(key, historicalOptions.tradingDay) : () => readHistoryCache(key, range, displayInterval, historyTtlSeconds);
  const cacheWriter =
    range === "1d" ? (data: HistoryPoint[]) => writeIntradayCache(key, data, historicalOptions.tradingDay) : (data: HistoryPoint[]) => writeHistoryCache(key, range, displayInterval, data);

  if (range === "1d") {
    const cached = readIntradayCache(key, historicalOptions.tradingDay);
    const latest = cached ?? readLatestIntradayCache(key);
    const updatedAt = latest?.lastUpdatedAt ? latest.lastUpdatedAt * 1000 : undefined;
    if (latest && !shouldRefreshMarketData(key, quoteForRange?.exchange, updatedAt, range)) {
      logMarketData("cache-hit", { provider: "local-cache", method: `history:${key}:${range}`, symbol: key, stale: latest.stale, durationMs: 0 });
      return { data: markStaleList(latest.data, latest.stale), stale: latest.stale };
    }
  }

  const result = await safeYahooCall<HistoryPoint[]>(
    `history:${key}:${range}`,
    async () => {
      const { tradingDay: _tradingDay, marketHours: _marketHours, displayInterval: _displayInterval, ...yahooOptions } = historicalOptions;
      const chart = (await dedupeInFlight(`chart:${key}:${range}:${historicalOptions.interval}`, () =>
        yahooClient.chart(key, { ...yahooOptions, return: "array" } as any)
      )) as any;
      const rows = chart.quotes ?? [];
      const mapped = sanitizeHistoryPoints(key, range, mapChartRows(rows, historicalOptions.period2));
      const aggregated = range === "1d" ? mapped : aggregateHistoryPoints(mapped, historicalOptions.displayInterval);
      const history = sanitizeHistoryPoints(key, range, aggregated);
      logger.debug("chart", "history fetch mapped", {
        symbol: key,
        range,
        interval: historicalOptions.interval,
        points: history.length,
        firstPoint: history[0],
        lastPoint: history[history.length - 1]
      });
      return history;
    },
    cacheReader,
    cacheWriter
  );

  return { data: markStaleList(result.data, result.stale), stale: result.stale };
}
