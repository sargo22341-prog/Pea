import type { NewsArticle } from "@pea/shared";
import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { dedupeInFlight } from "../../shared/inFlightDeduper.js";
import { logger } from "../../shared/logger.service.js";
import { newsCacheAgeSeconds, readNewsCache, writeNewsCache } from "../cache/news.cache.js";
import { runWithLowerYahooPriority, yahooCallPriority } from "../yahoo-call-priority.js";
import { errorMessage } from "../yahoo.errors.js";

/** Récupère un flux auprès de Yahoo ; `null` signifie « rien d'utile, garder le cache existant ». */
export type NewsFetcher = () => Promise<NewsArticle[] | null>;

/** Télécharge un flux une seule fois même si plusieurs appelants le demandent, puis l'écrit en cache. */
function refreshNewsFeed(cacheKey: string, fetcher: NewsFetcher): Promise<NewsArticle[] | null> {
  return dedupeInFlight(`news-refresh:${cacheKey}`, () => runWithLowerYahooPriority(yahooCallPriority.news, async () => {
    const payload = await fetcher();
    if (payload) writeNewsCache(cacheKey, payload);
    return payload;
  }));
}

function refreshInBackground(cacheKey: string, fetcher: NewsFetcher, context: Record<string, unknown>) {
  void refreshNewsFeed(cacheKey, fetcher).catch((error: unknown) => {
    logger.warn("news", "background news refresh failed", { ...context, cacheKey, error: errorMessage(error) });
  });
}

/**
 * Stale-while-revalidate : un cache frais est servi tel quel ; un cache périmé (sous le seuil de
 * rejet) est servi immédiatement et rafraîchi en arrière-plan. Yahoo n'est attendu qu'en
 * l'absence totale de cache ; s'il échoue alors, le flux est vide et marqué périmé.
 */
export async function readNewsStaleWhileRevalidate(
  cacheKey: string,
  fetcher: NewsFetcher,
  context: Record<string, unknown>
): Promise<MarketDataResult<NewsArticle[]>> {
  const cached = readNewsCache(cacheKey);
  if (cached && !cached.stale) {
    logger.debug("news", "cache-hit", { ...context, count: cached.data.length });
    return cached;
  }
  if (cached) {
    logger.debug("news", "stale cache served, refreshing in background", { ...context, count: cached.data.length });
    refreshInBackground(cacheKey, fetcher, context);
    return cached;
  }

  logger.debug("news", "cache-miss", context);
  try {
    const payload = await refreshNewsFeed(cacheKey, fetcher);
    return { data: payload ?? [], stale: payload === null };
  } catch (error) {
    logger.warn("news", "Yahoo news error", { ...context, error: errorMessage(error) });
    return { data: [], stale: true };
  }
}

/**
 * Préchargement : rafraîchit le flux s'il est absent ou plus vieux que `maxAgeSeconds`, avec la
 * priorité la plus basse de la file Yahoo. Renvoie vrai si un appel Yahoo a été effectué.
 */
export async function prefetchNewsFeed(cacheKey: string, fetcher: NewsFetcher, maxAgeSeconds: number) {
  const ageSeconds = newsCacheAgeSeconds(cacheKey);
  if (ageSeconds !== null && ageSeconds < maxAgeSeconds) return false;
  await runWithLowerYahooPriority(yahooCallPriority.background, () => refreshNewsFeed(cacheKey, fetcher));
  return true;
}
