/**
 * Role du fichier : lire et ecrire les caches SQL simples indexes par symbole
 * (quotes, dividendes, fundamentals, news legacy).
 */

import type { MarketDataResult } from "../../market/market-data-provider.js";
import { db } from "../../../db.js";
import { cacheIsStale, nowSeconds } from "../utils/stale.js";

export type CacheTable = "cached_quotes" | "cached_dividends" | "cached_news" | "cached_fundamentals";

function exchangeFromCachedPayload(payload: unknown) {
  if (payload && typeof payload === "object" && "exchange" in payload) {
    const exchange = (payload as { exchange?: unknown }).exchange;
    return typeof exchange === "string" ? exchange : undefined;
  }
  return undefined;
}

/** Lit un payload JSON et calcule son etat stale selon le TTL fourni. */
export function readCache<T>(table: CacheTable, symbol: string, ttlSeconds: number): MarketDataResult<T> | null {
  const row = db.prepare(`SELECT payload, fetched_at FROM ${table} WHERE symbol = ?`).get(symbol.toUpperCase()) as
    | { payload: string; fetched_at: number }
    | undefined;

  if (!row) return null;
  const data = JSON.parse(String(row.payload)) as T;
  const stale = cacheIsStale(symbol, exchangeFromCachedPayload(data), Number(row.fetched_at), ttlSeconds);
  return { data, stale };
}

/** Ecrit un payload JSON dans une table de cache par symbole. */
export function writeCache(table: CacheTable, symbol: string, payload: unknown) {
  db.prepare(
    `INSERT INTO ${table} (symbol, payload, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
  ).run(symbol.toUpperCase(), JSON.stringify(payload), nowSeconds());
}
