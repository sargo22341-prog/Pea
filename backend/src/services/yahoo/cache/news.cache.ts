import type { NewsArticle } from "@pea/shared";
import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { unifiedCacheRepository } from "../../../repositories/cache/unified-cache.repository.js";
import { logger } from "../../shared/logger.service.js";
import { nowSeconds } from "../utils/stale.js";
import { NEWS_FRESH_TTL_S, NEWS_STALE_REJECT_S } from "./cache.constants.js";

/** Les clés de flux sont stockées en majuscules dans le scope `news` de `cache_entries`. */
function storageKey(cacheKey: string) {
  return cacheKey.toUpperCase();
}

/**
 * Lit un flux de news cache et force stale si les anciennes donnees n'ont pas de date.
 * Rejette l'entrée au-delà de NEWS_STALE_REJECT_S pour ne jamais servir des news vieilles d'une semaine.
 */
export function readNewsCache(cacheKey: string): MarketDataResult<NewsArticle[]> | null {
  const row = unifiedCacheRepository.read("news", storageKey(cacheKey));

  if (!row) return null;
  const ageSeconds = nowSeconds() - row.fetched_at;
  if (ageSeconds > NEWS_STALE_REJECT_S) {
    logger.warn("cache", "stale news cache rejected", { cacheKey, ageSeconds, staleRejectSeconds: NEWS_STALE_REJECT_S });
    return null;
  }
  const data = JSON.parse(row.payload) as NewsArticle[];
  if (data.some((article) => !article.publishedAt)) return { data, stale: true };
  return { data, stale: ageSeconds >= NEWS_FRESH_TTL_S };
}

/** Âge en secondes d'un flux en cache, ou null s'il est absent. */
export function newsCacheAgeSeconds(cacheKey: string): number | null {
  const row = unifiedCacheRepository.read("news", storageKey(cacheKey));
  return row ? nowSeconds() - row.fetched_at : null;
}

/**
 * Ecrit un flux de news cache sous une cle symbolique. L'expiration (en millisecondes, comme
 * toute la table) correspond au seuil de rejet : le nettoyage périodique purge ensuite la ligne.
 */
export function writeNewsCache(cacheKey: string, payload: NewsArticle[]) {
  const fetchedAt = nowSeconds();
  unifiedCacheRepository.write({
    scope: "news",
    key: storageKey(cacheKey),
    payload,
    fetchedAt,
    expiresAt: (fetchedAt + NEWS_STALE_REJECT_S) * 1000
  });
}
