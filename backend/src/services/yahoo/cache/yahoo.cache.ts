import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { yahooCacheRepository, type YahooCacheTable } from "../../../repositories/yahoo/yahoo-cache.repository.js";
import { cacheIsStale, nowSeconds } from "../utils/stale.js";

export type CacheTable = YahooCacheTable;

function exchangeFromCachedPayload(payload: unknown) {
  if (payload && typeof payload === "object" && "exchange" in payload) {
    const exchange = (payload as { exchange?: unknown }).exchange;
    return typeof exchange === "string" ? exchange : undefined;
  }
  return undefined;
}

/** Lit un payload JSON et calcule son etat stale selon le TTL fourni. */
export function readCache<T>(table: CacheTable, symbol: string, ttlSeconds: number): MarketDataResult<T> | null {
  const row = yahooCacheRepository.readSymbol(table, symbol);

  if (!row) return null;
  const data = JSON.parse(String(row.payload)) as T;
  const stale = cacheIsStale(symbol, exchangeFromCachedPayload(data), Number(row.fetched_at), ttlSeconds);
  return { data, stale };
}

/** Ecrit un payload JSON dans une table de cache par symbole. */
export function writeCache(table: CacheTable, symbol: string, payload: unknown) {
  yahooCacheRepository.writeSymbol(table, symbol, payload, nowSeconds());
}
