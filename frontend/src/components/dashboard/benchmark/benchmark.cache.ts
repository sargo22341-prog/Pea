/**
 * Rôle du fichier : cache mémoire côté frontend pour les données benchmark Yahoo Finance.
 * Évite de rappeler l'API à chaque changement de range ou de re-render.
 *
 * Stratégie : Map<"ticker:range", { data, expiresAt }>.
 * Les TTL varient selon la range pour équilibrer fraîcheur et économie d'appels.
 */

import type { AssetChartDto } from "@pea/shared";

interface CacheEntry {
  data: AssetChartDto;
  expiresAt: number;
}

/**
 * TTL en millisecondes par range.
 * Cohérent avec les TTL du cache backend (portfolio_chart_cache).
 */
const TTL_BY_RANGE: Record<string, number> = {
  "1d": 5 * 60 * 1000,
  "1w": 30 * 60 * 1000,
  "1m": 4 * 60 * 60 * 1000,
  ytd: 4 * 60 * 60 * 1000,
  "1y": 4 * 60 * 60 * 1000,
  "5y": 12 * 60 * 60 * 1000,
  "10y": 12 * 60 * 60 * 1000,
  all: 12 * 60 * 60 * 1000
};

const DEFAULT_TTL = 60 * 60 * 1000;

const store = new Map<string, CacheEntry>();

/** Retourne les données en cache si non expirées, sinon null. */
export function getCachedBenchmark(ticker: string, range: string): AssetChartDto | null {
  const key = `${ticker}:${range}`;
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

/** Stocke les données benchmark en cache avec le TTL adapté à la range. */
export function setCachedBenchmark(ticker: string, range: string, data: AssetChartDto): void {
  const key = `${ticker}:${range}`;
  const ttl = TTL_BY_RANGE[range] ?? DEFAULT_TTL;
  store.set(key, { data, expiresAt: Date.now() + ttl });
}
