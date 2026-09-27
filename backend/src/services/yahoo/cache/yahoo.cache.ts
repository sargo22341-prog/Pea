import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { yahooCacheRepository, type YahooCacheTable } from "../../../repositories/yahoo/yahoo-cache.repository.js";
import { logger } from "../../shared/logger.service.js";
import { cacheIsStale, nowSeconds } from "../utils/stale.js";

export type CacheTable = YahooCacheTable;


/**
 * Lit un payload JSON et calcule son etat stale selon le TTL fourni.
 *
 * Si `staleRejectSeconds` est défini, retourne null lorsque l'entrée est plus vieille que ce
 * seuil — empêchant de servir du cache obsolète comme fallback (ex: prix d'il y a 1 an pendant
 * une panne Yahoo). Le TTL de fraîcheur reste calculé séparément.
 */
export function readCache<T>(
  table: CacheTable,
  symbol: string,
  ttlSeconds: number,
  staleRejectSeconds?: number
): MarketDataResult<T> | null {
  const row = yahooCacheRepository.readSymbol(table, symbol);

  if (!row) return null;
  const ageSeconds = nowSeconds() - row.fetched_at;
  if (staleRejectSeconds !== undefined && ageSeconds > staleRejectSeconds) {
    logger.warn("cache", "stale cache entry rejected", {
      table,
      symbol,
      ageSeconds,
      staleRejectSeconds
    });
    return null;
  }
  const data = JSON.parse(row.payload) as T;
  const stale = cacheIsStale(row.fetched_at, ttlSeconds);
  return { data, stale };
}

/** Ecrit un payload JSON dans une table de cache par symbole. */
export function writeCache(table: CacheTable, symbol: string, payload: unknown) {
  yahooCacheRepository.writeSymbol(table, symbol, payload, nowSeconds());
}
