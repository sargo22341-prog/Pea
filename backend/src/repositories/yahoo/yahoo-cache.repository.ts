import { db } from "../../db.js";
import { unifiedCacheRepository, type CacheScope } from "../cache/unified-cache.repository.js";

/**
 * Compatibilité historique : `YahooCacheTable` était l'enum des 4 anciennes tables Yahoo.
 * On le mappe désormais vers les scopes équivalents de `cache_entries`. Le type est conservé
 * comme alias pour limiter l'impact des refactos en cours dans le reste du code.
 */
export type YahooCacheTable = "cached_quotes" | "cached_dividends" | "cached_news" | "cached_fundamentals";

const TABLE_TO_SCOPE: Record<YahooCacheTable, CacheScope> = {
  cached_quotes: "quote",
  cached_dividends: "dividends",
  cached_news: "news",
  cached_fundamentals: "fundamentals"
};

export class YahooCacheRepository {
  readSymbol(table: YahooCacheTable, symbol: string) {
    const row = unifiedCacheRepository.read(TABLE_TO_SCOPE[table], symbol.toUpperCase());
    if (!row) return undefined;
    return { payload: row.payload, fetched_at: row.fetched_at };
  }

  writeSymbol(table: YahooCacheTable, symbol: string, payload: unknown, fetchedAt: number) {
    unifiedCacheRepository.write({
      scope: TABLE_TO_SCOPE[table],
      key: symbol.toUpperCase(),
      payload,
      fetchedAt
    });
  }

  readHistory(cacheKey: string) {
    const row = unifiedCacheRepository.read("history", cacheKey);
    if (!row) return undefined;
    return { payload: row.payload, fetched_at: row.fetched_at };
  }

  writeHistory(input: { cacheKey: string; symbol: string; range: string; payload: unknown; fetchedAt: number }) {
    unifiedCacheRepository.write({
      scope: "history",
      key: input.cacheKey,
      payload: input.payload,
      fetchedAt: input.fetchedAt
    });
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
