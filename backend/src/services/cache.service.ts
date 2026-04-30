/**
 * Rôle du fichier : fournir les primitives de cache métier SQLite pour les DTO
 * légers consommés par le frontend et centraliser TTL, clés et invalidations.
 */

import type { DisplayRangeKey, MarketState, RangeKey } from "@pea/shared";
import { db } from "../db.js";

export const shortChartRanges = new Set<RangeKey>(["1d", "1w"]);

const chartTtlByRange: Record<RangeKey, number> = {
  "1d": 10 * 60 * 1000,
  "1w": 2 * 60 * 60 * 1000,
  "1m": 4 * 60 * 60 * 1000,
  ytd: 24 * 60 * 60 * 1000,
  "1y": 24 * 60 * 60 * 1000,
  all: 7 * 24 * 60 * 60 * 1000,
  max: 7 * 24 * 60 * 60 * 1000
};

const displayRangeByRange: Record<RangeKey, DisplayRangeKey> = {
  "1d": "intraday",
  "1w": "1W",
  "1m": "1M",
  ytd: "YTD",
  "1y": "1Y",
  all: "ALL",
  max: "MAX"
};

export interface CacheRecord<T> {
  payload: T;
  cachedAt: number;
  expiresAt: number;
  marketState?: MarketState;
}

interface CacheValidationInput {
  table: string;
  keyColumn: string;
  key: string;
  currentMarketState?: MarketState;
  checkMarketState: boolean;
  forceRefresh?: boolean;
  minimumCachedAt?: number;
  minimumPayloadTimestamp?: number;
  ignoreTtl?: boolean;
}

/**
 * Retourne le timestamp courant en millisecondes.
 *
 * @returns Timestamp Unix en millisecondes.
 */
export function nowMs() {
  return Date.now();
}

/**
 * Convertit une range historique interne en libellé DTO stable pour l'API.
 *
 * @param range Range utilisée par l'application historique.
 * @returns Range prête à être renvoyée au frontend.
 */
export function toDisplayRange(range: RangeKey): DisplayRangeKey {
  return displayRangeByRange[range];
}

/**
 * Donne le TTL chart demandé pour une range.
 *
 * @param range Range de chart.
 * @returns Durée de validité en millisecondes.
 */
export function chartTtlMs(range: RangeKey) {
  return chartTtlByRange[range];
}

/**
 * Calcule la date d'expiration d'un cache à partir du moment courant.
 *
 * @param ttlMs Durée de vie en millisecondes.
 * @returns Timestamp Unix d'expiration en millisecondes.
 */
export function expiresIn(ttlMs: number) {
  return nowMs() + ttlMs;
}

/**
 * Normalise l'état de marché Yahoo vers les quatre états supportés par les DTO.
 *
 * @param value Etat éventuellement fourni par Yahoo Finance.
 * @returns Etat normalisé ou CLOSED par défaut.
 */
export function normalizeMarketState(value: unknown): MarketState {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "REGULAR" || normalized === "OPEN") return "OPEN";
  if (normalized === "PRE" || normalized === "PREPRE" || normalized === "PRE_MARKET") return "PRE";
  if (normalized === "POST" || normalized === "POSTPOST" || normalized === "POST_MARKET") return "POST";
  return "CLOSED";
}

/**
 * Construit la clé persistée pour un chart d'actif.
 *
 * @param symbol Symbole de l'actif.
 * @param range Range demandée.
 * @param interval Granularité affichée.
 * @returns Clé de cache stable.
 */
export function assetChartCacheKey(symbol: string, range: RangeKey, interval: string) {
  return `asset:chart:${symbol.toUpperCase()}:${toDisplayRange(range)}:${interval}`;
}

/**
 * Construit la clé persistée pour un chart de portefeuille.
 *
 * @param userId Identifiant utilisateur.
 * @param range Range demandée.
 * @returns Clé de cache stable.
 */
export function portfolioChartCacheKey(userId: string, range: RangeKey) {
  return `portfolio:chart:${userId}:${toDisplayRange(range)}`;
}

/**
 * Lit un cache JSON et applique les règles de TTL et d'état de marché.
 *
 * @param input Informations de table, clé et validation.
 * @returns Cache valide ou null si un refresh est nécessaire.
 */
export function readJsonCache<T>(input: CacheValidationInput): CacheRecord<T> | null {
  const row = db.prepare(`SELECT payload, cached_at, expires_at, market_state FROM ${input.table} WHERE ${input.keyColumn} = ?`).get(input.key) as
    | { payload: string; cached_at: number; expires_at: number; market_state?: string }
    | undefined;
  if (!row) return null;

  const marketState = row.market_state ? normalizeMarketState(row.market_state) : undefined;
  const payload = JSON.parse(String(row.payload)) as T;
  if (input.forceRefresh) return null;
  if (input.checkMarketState && marketState !== input.currentMarketState) return null;
  if (input.minimumCachedAt != null && Number(row.cached_at) < input.minimumCachedAt) return null;
  if (input.minimumPayloadTimestamp != null && lastPayloadTimestamp(payload) < input.minimumPayloadTimestamp) return null;
  if (!input.ignoreTtl && nowMs() > Number(row.expires_at)) return null;

  return {
    payload,
    cachedAt: Number(row.cached_at),
    expiresAt: Number(row.expires_at),
    marketState
  };
}

/**
 * Lit le dernier timestamp d'un DTO chart compact.
 *
 * @param payload DTO JSON désérialisé depuis le cache.
 * @returns Dernier timestamp connu ou 0 si le payload n'est pas un chart.
 */
function lastPayloadTimestamp(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("timestamps" in payload)) return 0;
  const timestamps = (payload as { timestamps?: unknown }).timestamps;
  if (!Array.isArray(timestamps) || !timestamps.length) return 0;
  const last = Number(timestamps[timestamps.length - 1]);
  return Number.isFinite(last) ? last : 0;
}

/**
 * Lit un cache JSON sans contrôle d'état de marché.
 *
 * @param table Table cible.
 * @param keyColumn Colonne de clé primaire.
 * @param key Valeur de clé.
 * @returns Cache valide ou null si le TTL est dépassé.
 */
export function readStaticJsonCache<T>(table: string, keyColumn: string, key: string): CacheRecord<T> | null {
  const row = db.prepare(`SELECT payload, cached_at, expires_at FROM ${table} WHERE ${keyColumn} = ?`).get(key) as
    | { payload: string; cached_at: number; expires_at: number }
    | undefined;
  if (!row) return null;
  if (nowMs() > Number(row.expires_at)) return null;
  return {
    payload: JSON.parse(String(row.payload)) as T,
    cachedAt: Number(row.cached_at),
    expiresAt: Number(row.expires_at)
  };
}

/**
 * Ecrit un cache JSON avec les colonnes optionnelles d'état de marché.
 *
 * @param table Table cible.
 * @param keyColumn Colonne de clé primaire.
 * @param key Valeur de clé.
 * @param payload DTO à sérialiser.
 * @param cachedAt Date de création en millisecondes.
 * @param expiresAt Date d'expiration en millisecondes.
 * @param marketState Etat de marché capturé au moment du cache.
 * @returns Rien.
 */
export function writeJsonCache(
  table: string,
  keyColumn: string,
  key: string,
  payload: unknown,
  cachedAt: number,
  expiresAt: number,
  marketState?: MarketState
) {
  db.prepare(
    `INSERT INTO ${table} (${keyColumn}, payload, cached_at, expires_at, market_state)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(${keyColumn}) DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at, expires_at = excluded.expires_at, market_state = excluded.market_state`
  ).run(key, JSON.stringify(payload), cachedAt, expiresAt, marketState ?? null);
}

/**
 * Ecrit un cache JSON dans une table sans colonne d'état de marché.
 *
 * @param table Table cible.
 * @param keyColumn Colonne de clé primaire.
 * @param key Valeur de clé.
 * @param payload DTO à sérialiser.
 * @param cachedAt Date de création en millisecondes.
 * @param expiresAt Date d'expiration en millisecondes.
 * @returns Rien.
 */
export function writeStaticJsonCache(table: string, keyColumn: string, key: string, payload: unknown, cachedAt: number, expiresAt: number) {
  db.prepare(
    `INSERT INTO ${table} (${keyColumn}, payload, cached_at, expires_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(${keyColumn}) DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at, expires_at = excluded.expires_at`
  ).run(key, JSON.stringify(payload), cachedAt, expiresAt);
}

/**
 * Ecrit un chart d'actif avec ses colonnes de recherche spécialisées.
 *
 * @param cacheKey Clé complète du chart.
 * @param symbol Symbole de l'actif.
 * @param range Range affichée.
 * @param interval Granularité affichée.
 * @param payload DTO de chart.
 * @param cachedAt Date de création en millisecondes.
 * @param expiresAt Date d'expiration en millisecondes.
 * @param marketState Etat de marché optionnel.
 * @returns Rien.
 */
export function writeAssetChartCache(cacheKey: string, symbol: string, range: DisplayRangeKey, interval: string, payload: unknown, cachedAt: number, expiresAt: number, marketState?: MarketState) {
  db.prepare(
    `INSERT INTO asset_chart_cache (cache_key, symbol, range, interval, payload, cached_at, expires_at, market_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at, expires_at = excluded.expires_at, market_state = excluded.market_state`
  ).run(cacheKey, symbol.toUpperCase(), range, interval, JSON.stringify(payload), cachedAt, expiresAt, marketState ?? null);
}

/**
 * Ecrit un chart de portefeuille avec ses colonnes de recherche spécialisées.
 *
 * @param cacheKey Clé complète du chart.
 * @param userId Identifiant utilisateur.
 * @param range Range affichée.
 * @param payload DTO de chart.
 * @param cachedAt Date de création en millisecondes.
 * @param expiresAt Date d'expiration en millisecondes.
 * @param marketState Etat de marché optionnel.
 * @returns Rien.
 */
export function writePortfolioChartCache(cacheKey: string, userId: string, range: DisplayRangeKey, payload: unknown, cachedAt: number, expiresAt: number, marketState?: MarketState) {
  db.prepare(
    `INSERT INTO portfolio_chart_cache (cache_key, user_id, range, payload, cached_at, expires_at, market_state)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at, expires_at = excluded.expires_at, market_state = excluded.market_state`
  ).run(cacheKey, userId, range, JSON.stringify(payload), cachedAt, expiresAt, marketState ?? null);
}

/**
 * Supprime les caches dépendants des transactions d'un utilisateur.
 *
 * @param userId Identifiant utilisateur concerné.
 * @param symbol Symbole modifié, si l'invalidation concerne une seule ligne.
 * @returns Rien.
 */
export function invalidateUserAssetCaches(userId: string, symbol?: string) {
  if (userId === "*") {
    if (symbol) {
      db.prepare("DELETE FROM user_assets WHERE symbol = ?").run(symbol.toUpperCase());
    } else {
      db.prepare("DELETE FROM user_assets").run();
    }
    db.prepare("DELETE FROM portfolio_chart_cache").run();
    return;
  }
  if (symbol) {
    db.prepare("DELETE FROM user_assets WHERE user_id = ? AND symbol = ?").run(userId, symbol.toUpperCase());
  } else {
    db.prepare("DELETE FROM user_assets WHERE user_id = ?").run(userId);
  }
  db.prepare("DELETE FROM portfolio_chart_cache WHERE user_id = ?").run(userId);
}

/**
 * Vide tous les caches métier tout en conservant les positions, transactions et utilisateurs.
 *
 * @returns Liste des tables nettoyées.
 */
export function clearAllBusinessCaches() {
  const tables = [
    "asset_static_cache",
    "asset_chart_cache",
    "asset_market_cache",
    "asset_dividend_cache",
    "asset_article_cache",
    "user_assets",
    "portfolio_chart_cache",
    "cached_quotes",
    "cached_history",
    "cached_intraday_history",
    "cached_dividends",
    "cached_news",
    "cached_fundamentals"
  ];
  for (const table of tables) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  return tables;
}
