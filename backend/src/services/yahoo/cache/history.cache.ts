import type { HistoryPoint, RangeKey } from "@pea/shared";
import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { yahooCacheRepository } from "../../../repositories/yahoo/yahoo-cache.repository.js";
import { getCurrentTradingDay } from "../../../utils/range.js";
import { cacheIsStale, historyCacheIsStale, nowSeconds } from "../utils/stale.js";
import { sanitizeHistoryPoints } from "../history/history.sanitizer.js";

export type IntradayCacheResult = MarketDataResult<HistoryPoint[]> & { tradingDay: string; lastUpdatedAt: number };

function historyCacheKey(symbol: string, range: RangeKey, interval: string) {
  return `${symbol.toUpperCase()}:${range}:${interval}`;
}

function intradayCacheKey(symbol: string, tradingDay: string) {
  return `${symbol.toUpperCase()}:1d:5m:${tradingDay}`;
}

/** Lit un cache historique hors 1d. */
export function readHistoryCache(symbol: string, range: RangeKey, interval: string, ttlSeconds: number): MarketDataResult<HistoryPoint[]> | null {
  const cacheKey = historyCacheKey(symbol, range, interval);
  const row = yahooCacheRepository.readHistory(cacheKey);

  if (!row) return null;
  const stale = range === "1w" ? historyCacheIsStale(symbol, range, Number(row.fetched_at)) : cacheIsStale(symbol, undefined, Number(row.fetched_at), ttlSeconds);
  return { data: sanitizeHistoryPoints(symbol.toUpperCase(), range, JSON.parse(String(row.payload)) as HistoryPoint[]), stale };
}

/** Lit le cache intraday du jour, avec fallback sur le plus recent si le jour manque. */
export function readIntradayCache(symbol: string, tradingDay = getCurrentTradingDay(symbol)): IntradayCacheResult | null {
  const cacheKey = intradayCacheKey(symbol, tradingDay);
  const row = yahooCacheRepository.readIntraday(cacheKey);

  if (!row) {
    const fallback = yahooCacheRepository.readIntradayFallback(symbol);
    if (!fallback) return null;
    return {
      data: sanitizeHistoryPoints(symbol.toUpperCase(), "1d", JSON.parse(String(fallback.payload)) as HistoryPoint[]),
      stale: true,
      tradingDay: String(fallback.trading_day),
      lastUpdatedAt: Number(fallback.last_updated_at)
    };
  }

  const stale = historyCacheIsStale(symbol, "1d", Number(row.last_updated_at));
  return {
    data: sanitizeHistoryPoints(symbol.toUpperCase(), "1d", JSON.parse(String(row.payload)) as HistoryPoint[]),
    stale,
    tradingDay: String(row.trading_day),
    lastUpdatedAt: Number(row.last_updated_at)
  };
}

/** Lit le dernier cache intraday disponible, meme s'il est force stale. */
export function readLatestIntradayCache(symbol: string): IntradayCacheResult | null {
  const row = yahooCacheRepository.readLatestIntraday(symbol);
  if (!row) return null;
  return {
    data: sanitizeHistoryPoints(symbol.toUpperCase(), "1d", JSON.parse(String(row.payload)) as HistoryPoint[]),
    stale: true,
    tradingDay: String(row.trading_day),
    lastUpdatedAt: Number(row.last_updated_at)
  };
}

/** Ecrit un cache historique hors intraday. */
export function writeHistoryCache(symbol: string, range: RangeKey, interval: string, payload: HistoryPoint[]) {
  yahooCacheRepository.writeHistory({ cacheKey: historyCacheKey(symbol, range, interval), symbol, range, payload, fetchedAt: nowSeconds() });
}

/** Supprime les entrees cached_intraday_history superflues, en gardant les N dernieres trading_days. */
export function pruneIntradayCache(symbol: string, keepTradingDays = 3) {
  yahooCacheRepository.pruneIntraday(symbol, keepTradingDays);
}

/** Ecrit le cache intraday pour un trading day donne. */
export function writeIntradayCache(symbol: string, payload: HistoryPoint[], tradingDay = getCurrentTradingDay(symbol)) {
  yahooCacheRepository.writeIntraday({ cacheKey: intradayCacheKey(symbol, tradingDay), symbol, tradingDay, payload, lastUpdatedAt: nowSeconds() });
}
