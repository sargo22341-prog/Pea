import type { NewsArticle } from "@pea/shared";
import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { yahooCacheRepository } from "../../../repositories/yahoo/yahoo-cache.repository.js";
import { logger } from "../../shared/logger.service.js";
import { nowSeconds } from "../utils/stale.js";
import { NEWS_FRESH_TTL_S, NEWS_STALE_REJECT_S } from "./cache.constants.js";

/**
 * Lit un flux de news cache et force stale si les anciennes donnees n'ont pas de date.
 * Rejette l'entrée au-delà de NEWS_STALE_REJECT_S pour ne jamais servir des news vieilles d'une semaine.
 */
export function readNewsCache(cacheKey: string): MarketDataResult<NewsArticle[]> | null {
  const row = yahooCacheRepository.readSymbol("cached_news", cacheKey);

  if (!row) return null;
  const ageSeconds = nowSeconds() - Number(row.fetched_at);
  if (ageSeconds > NEWS_STALE_REJECT_S) {
    logger.warn("cache", "stale news cache rejected", { cacheKey, ageSeconds, staleRejectSeconds: NEWS_STALE_REJECT_S });
    return null;
  }
  const data = JSON.parse(String(row.payload)) as NewsArticle[];
  if (data.some((article) => !article.publishedAt)) return { data, stale: true };
  return { data, stale: ageSeconds >= NEWS_FRESH_TTL_S };
}

/** Ecrit un flux de news cache sous une cle symbolique. */
export function writeNewsCache(cacheKey: string, payload: NewsArticle[]) {
  yahooCacheRepository.writeSymbol("cached_news", cacheKey, payload, nowSeconds());
}
