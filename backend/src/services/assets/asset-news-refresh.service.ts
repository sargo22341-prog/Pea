import type { NewsArticle, NewsLanguage } from "@pea/shared";
import { marketDataGateway } from "../market/data/market-data-gateway.service.js";
import { marketEventsService } from "../market/events/market-events.service.js";
import { logger } from "../shared/logger.service.js";
import { readNewsCache } from "../yahoo/cache/news.cache.js";
import { dedupeNewsArticles, normalizeNewsLanguages, sortNewsByDateDesc } from "../yahoo/news/news.filters.js";
import { newsCacheKey } from "../yahoo/news/news.keys.js";

class AssetNewsRefreshService {
  private readonly inFlight = new Set<string>();

  readCached(symbol: string, languages?: NewsLanguage[]) {
    const key = symbol.trim().toUpperCase();
    if (!key) return [];

    return sortNewsByDateDesc(dedupeNewsArticles(
      normalizeNewsLanguages(languages).flatMap((language) => readNewsCache(newsCacheKey(key, language))?.data ?? [])
    ));
  }

  refreshInBackgroundIfEmpty(symbol: string, languages?: NewsLanguage[]) {
    const key = symbol.trim().toUpperCase();
    if (!key) return;
    if (this.readCached(key, languages).length > 0) return;

    const refreshKey = `${key}:${normalizeNewsLanguages(languages).join(",")}`;
    if (this.inFlight.has(refreshKey)) return;
    this.inFlight.add(refreshKey);

    void marketDataGateway.readNewsWithCache(key, languages)
      .then((result) => {
        if (!result.data.length) return;
        marketEventsService.emitToAll("asset-annex-updated", {
          symbol: key,
          updatedAt: new Date().toISOString()
        });
      })
      .catch((error) => {
        logger.warn("news", "asset background news refresh failed", {
          symbol: key,
          error: error instanceof Error ? error.message : String(error)
        });
      })
      .finally(() => {
        this.inFlight.delete(refreshKey);
      });
  }
}

export const assetNewsRefreshService = new AssetNewsRefreshService();
