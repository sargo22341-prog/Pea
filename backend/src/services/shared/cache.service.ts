import type { DisplayRangeKey, MarketState, RangeKey } from "@pea/shared";
import { cacheRepository } from "../../repositories/cache/cache.repository.js";
import type { FrontendBlock } from "./frontend-block-cache.service.js";
import { cacheRegistry } from "./cache-registry.service.js";

const displayRangeByRange: Record<RangeKey, DisplayRangeKey> = {
  "1d": "intraday",
  "1w": "1W",
  "1m": "1M",
  ytd: "YTD",
  "1y": "1Y",
  "5y": "5Y",
  "10y": "10Y",
  all: "ALL"
};

export interface CacheRecord<T> {
  payload: T;
  cachedAt: number;
  expiresAt: number;
  marketState?: MarketState;
}

/** Retourne le timestamp courant en millisecondes. */
export function nowMs() {
  return Date.now();
}

/** Convertit une range historique interne en libelle DTO stable pour l'API. */
export function toDisplayRange(range: RangeKey): DisplayRangeKey {
  return displayRangeByRange[range];
}

/** Calcule la date d'expiration d'un cache a partir du moment courant. */
export function expiresIn(ttlMs: number) {
  return nowMs() + ttlMs;
}

/** Normalise l'etat de marche Yahoo vers les quatre etats supportes par les DTO. */
export function normalizeMarketState(value: unknown): MarketState {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "REGULAR" || normalized === "OPEN") return "OPEN";
  if (normalized === "PRE" || normalized === "PREPRE" || normalized === "PRE_MARKET") return "PRE";
  if (normalized === "POST" || normalized === "POSTPOST" || normalized === "POST_MARKET") return "POST";
  return "CLOSED";
}

/** Lit un cache JSON sans controle d'etat de marche. */
export function readStaticJsonCache<T>(table: string, keyColumn: string, key: string): CacheRecord<T> | null {
  const cacheTarget = staticCacheTarget(table, keyColumn);
  const row = cacheRepository.readStatic(cacheTarget, key);
  if (!row) return null;
  if (nowMs() > Number(row.expires_at)) return null;
  return {
    payload: JSON.parse(String(row.payload)) as T,
    cachedAt: Number(row.cached_at),
    expiresAt: Number(row.expires_at)
  };
}

/** Ecrit un cache JSON dans une table sans colonne d'etat de marche. */
export function writeStaticJsonCache(table: string, keyColumn: string, key: string, payload: unknown, cachedAt: number, expiresAt: number) {
  const cacheTarget = staticCacheTarget(table, keyColumn);
  cacheRepository.writeStatic(cacheTarget, key, payload, cachedAt, expiresAt);
}

const staticJsonCacheTargets = new Map<string, { table: string; keyColumn: string }>([
  ["asset_article_cache:symbol", { table: "asset_article_cache", keyColumn: "symbol" }]
]);

function staticCacheTarget(table: string, keyColumn: string) {
  const target = staticJsonCacheTargets.get(`${table}:${keyColumn}`);
  if (!target) throw new Error(`Cache SQL non autorise: ${table}.${keyColumn}`);
  return target;
}

/** Supprime les caches dependants des transactions d'un utilisateur. */
export function invalidateUserAssetCaches(userId: string, symbol?: string) {
  if (userId === "*") {
    cacheRegistry.invalidate({ type: "portfolio-all-users-changed", symbol });
    return;
  }
  cacheRegistry.invalidate({ type: "portfolio-user-changed", userId, symbol });
}

export function invalidateFrontendBlockCache(input: { userId?: string | number; block?: FrontendBlock }) {
  cacheRegistry.invalidate({ type: "frontend-block-changed", userId: input.userId, block: input.block });
}
