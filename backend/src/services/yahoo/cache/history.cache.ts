import type { HistoryPoint, RangeKey } from "@pea/shared";
import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { db } from "../../../db.js";
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
  const row = db.prepare("SELECT payload, fetched_at FROM cached_history WHERE cache_key = ?").get(cacheKey) as
    | { payload: string; fetched_at: number }
    | undefined;

  if (!row) return null;
  const stale = range === "1w" ? historyCacheIsStale(symbol, range, Number(row.fetched_at)) : cacheIsStale(symbol, undefined, Number(row.fetched_at), ttlSeconds);
  return { data: sanitizeHistoryPoints(symbol.toUpperCase(), range, JSON.parse(String(row.payload)) as HistoryPoint[]), stale };
}

/** Lit le cache intraday du jour, avec fallback sur le plus recent si le jour manque. */
export function readIntradayCache(symbol: string, tradingDay = getCurrentTradingDay(symbol)): IntradayCacheResult | null {
  const cacheKey = intradayCacheKey(symbol, tradingDay);
  const row = db.prepare("SELECT payload, trading_day, last_updated_at FROM cached_intraday_history WHERE cache_key = ?").get(cacheKey) as
    | { payload: string; trading_day: string; last_updated_at: number }
    | undefined;

  if (!row) {
    const fallback = db.prepare(
      "SELECT payload, trading_day, last_updated_at FROM cached_intraday_history WHERE symbol = ? AND range = '1d' AND interval = '5m' ORDER BY last_updated_at DESC LIMIT 1"
    ).get(symbol.toUpperCase()) as { payload: string; trading_day: string; last_updated_at: number } | undefined;
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
  const row = db.prepare(
    "SELECT payload, trading_day, last_updated_at FROM cached_intraday_history WHERE symbol = ? AND range = '1d' AND interval = '5m' ORDER BY trading_day DESC, last_updated_at DESC LIMIT 1"
  ).get(symbol.toUpperCase()) as { payload: string; trading_day: string; last_updated_at: number } | undefined;
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
  db.prepare(
    `INSERT INTO cached_history (cache_key, symbol, range, payload, fetched_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
  ).run(historyCacheKey(symbol, range, interval), symbol.toUpperCase(), range, JSON.stringify(payload), nowSeconds());
}

/** Supprime les entrees cached_intraday_history superflues, en gardant les N dernieres trading_days. */
export function pruneIntradayCache(symbol: string, keepTradingDays = 3) {
  db.prepare(
    `DELETE FROM cached_intraday_history
     WHERE symbol = ? AND range = '1d' AND interval = '5m'
       AND trading_day NOT IN (
         SELECT trading_day FROM cached_intraday_history
         WHERE symbol = ? AND range = '1d' AND interval = '5m'
         ORDER BY trading_day DESC
         LIMIT ?
       )`
  ).run(symbol.toUpperCase(), symbol.toUpperCase(), keepTradingDays);
}

/** Ecrit le cache intraday pour un trading day donne. */
export function writeIntradayCache(symbol: string, payload: HistoryPoint[], tradingDay = getCurrentTradingDay(symbol)) {
  db.prepare(
    `INSERT INTO cached_intraday_history (cache_key, symbol, range, interval, trading_day, payload, last_updated_at)
     VALUES (?, ?, '1d', '5m', ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, last_updated_at = excluded.last_updated_at`
  ).run(intradayCacheKey(symbol, tradingDay), symbol.toUpperCase(), tradingDay, JSON.stringify(payload), nowSeconds());
}
