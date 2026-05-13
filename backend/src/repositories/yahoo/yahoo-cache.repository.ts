import { db } from "../../db.js";

export type YahooCacheTable = "cached_quotes" | "cached_dividends" | "cached_news" | "cached_fundamentals";

export class YahooCacheRepository {
  readSymbol(table: YahooCacheTable, symbol: string) {
    return db.prepare(`SELECT payload, fetched_at FROM ${table} WHERE symbol = ?`).get(symbol.toUpperCase()) as
      | { payload: string; fetched_at: number }
      | undefined;
  }

  writeSymbol(table: YahooCacheTable, symbol: string, payload: unknown, fetchedAt: number) {
    db.prepare(
      `INSERT INTO ${table} (symbol, payload, fetched_at)
       VALUES (?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
    ).run(symbol.toUpperCase(), JSON.stringify(payload), fetchedAt);
  }

  readHistory(cacheKey: string) {
    return db.prepare("SELECT payload, fetched_at FROM cached_history WHERE cache_key = ?").get(cacheKey) as
      | { payload: string; fetched_at: number }
      | undefined;
  }

  readIntraday(cacheKey: string) {
    return db.prepare("SELECT payload, trading_day, last_updated_at FROM cached_intraday_history WHERE cache_key = ?").get(cacheKey) as
      | { payload: string; trading_day: string; last_updated_at: number }
      | undefined;
  }

  readIntradayFallback(symbol: string) {
    return db.prepare(
      "SELECT payload, trading_day, last_updated_at FROM cached_intraday_history WHERE symbol = ? AND range = '1d' AND interval = '5m' ORDER BY last_updated_at DESC LIMIT 1"
    ).get(symbol.toUpperCase()) as { payload: string; trading_day: string; last_updated_at: number } | undefined;
  }

  readLatestIntraday(symbol: string) {
    return db.prepare(
      "SELECT payload, trading_day, last_updated_at FROM cached_intraday_history WHERE symbol = ? AND range = '1d' AND interval = '5m' ORDER BY trading_day DESC, last_updated_at DESC LIMIT 1"
    ).get(symbol.toUpperCase()) as { payload: string; trading_day: string; last_updated_at: number } | undefined;
  }

  writeHistory(input: { cacheKey: string; symbol: string; range: string; payload: unknown; fetchedAt: number }) {
    db.prepare(
      `INSERT INTO cached_history (cache_key, symbol, range, payload, fetched_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
    ).run(input.cacheKey, input.symbol.toUpperCase(), input.range, JSON.stringify(input.payload), input.fetchedAt);
  }

  pruneIntraday(symbol: string, keepTradingDays: number) {
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

  writeIntraday(input: { cacheKey: string; symbol: string; tradingDay: string; payload: unknown; lastUpdatedAt: number }) {
    db.prepare(
      `INSERT INTO cached_intraday_history (cache_key, symbol, range, interval, trading_day, payload, last_updated_at)
       VALUES (?, ?, '1d', '5m', ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, last_updated_at = excluded.last_updated_at`
    ).run(input.cacheKey, input.symbol.toUpperCase(), input.tradingDay, JSON.stringify(input.payload), input.lastUpdatedAt);
  }
}

export const yahooCacheRepository = new YahooCacheRepository();
