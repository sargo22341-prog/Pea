import type { NewsArticle, NewsAssetsPage, NewsLanguage } from "@pea/shared";
import { config } from "../../config.js";
import { assetNewsRepository, type AssetNewsAggregate } from "../../repositories/news/asset-news.repository.js";
import { marketDataGateway } from "../market/data/market-data-gateway.service.js";
import { logger } from "../shared/logger.service.js";
import { sortNewsByDateDesc } from "../yahoo/news/news.filters.js";
import { listAssetNewsCandidates, listAssetNewsPositions, type AssetNewsCandidate, type AssetNewsPositionRow } from "./asset-news-candidates.js";
import { annotateEarningsArticles } from "./earnings-news.js";

/** Nombre d'actifs interrogés par lot. */
export const assetNewsBatchSize = 8;
/**
 * Durée de vie de la page agrégée. Courte : les flux sous-jacents sont servis depuis leur propre
 * cache, et la page Actualités se revalide toutes les 10 minutes.
 */
const aggregateCacheTtlSeconds = 5 * 60;
/** Nombre maximal d'articles conservés par lot agrégé. */
const maxArticlesPerBatch = 200;

/**
 * Signature du portefeuille dans la clé du cache agrégé : toute modification de position produit
 * une nouvelle clé, l'ancienne ligne expirant d'elle-même.
 */
function aggregateCacheKey(positions: AssetNewsPositionRow[], languages: NewsLanguage[], userId: number, limit: number, offset: number) {
  const signature = positions
    .map((position) => `${position.symbol}:${position.quantity}:${position.average_buy_price}:${position.updated_at}`)
    .join("|");
  return `news:assets:v6:${userId}:${languages.join(",")}:limit:${limit}:offset:${offset}:${signature}`;
}

/** Fusionne les flux par URL en conservant tous les actifs auxquels un article est lié. */
function mergeFeeds(feeds: { candidate: AssetNewsCandidate; articles: NewsArticle[] }[]) {
  const articlesByUrl = new Map<string, NewsArticle>();
  for (const { candidate, articles } of feeds) {
    for (const article of articles) {
      const existing = articlesByUrl.get(article.url);
      const relatedAssets = existing?.relatedAssets ?? [];
      if (!relatedAssets.some((asset) => asset.symbol === candidate.symbol)) relatedAssets.push({ symbol: candidate.symbol, name: candidate.name });
      articlesByUrl.set(article.url, { ...(existing ?? article), relatedAssets });
    }
  }
  return sortNewsByDateDesc([...articlesByUrl.values()]).slice(0, maxArticlesPerBatch);
}

async function buildAggregate(positions: AssetNewsPositionRow[], languages: NewsLanguage[], limit: number, offset: number) {
  const { candidates, skippedFunds } = listAssetNewsCandidates(positions);
  const batch = candidates.slice(offset, offset + limit);
  const feeds = await Promise.all(batch.map(async (candidate) => {
    try {
      const feed = await marketDataGateway.readCompanyNewsWithCache(candidate.symbol, candidate.query, languages);
      return { candidate, articles: feed.data, stale: feed.stale };
    } catch (error) {
      logger.warn("news", "asset company feed unavailable", { symbol: candidate.symbol, query: candidate.query, error: error instanceof Error ? error.message : String(error) });
      return { candidate, articles: [], stale: true };
    }
  }));
  const aggregate: AssetNewsAggregate = {
    articles: mergeFeeds(feeds),
    totalAssets: candidates.length,
    queriedAssets: batch.length,
    hasMore: offset + limit < candidates.length
  };
  logger.debug("news", "asset news aggregate built", { totalPositions: positions.length, skippedFunds, offset, limit, ...aggregate, articles: aggregate.articles.length });
  return { aggregate, complete: feeds.every((feed) => !feed.stale) };
}

/**
 * Lot d'actualités des actions détenues par l'utilisateur. Le cache agrégé est consulté avant
 * toute lecture de métadonnées ; il n'est écrit qu'à partir de flux frais, pour qu'un flux
 * périmé (en cours de rafraîchissement) ne fige pas la page pendant toute sa durée de vie.
 */
export async function readAssetNewsPage(userId: number, languages: NewsLanguage[], limit: number, offset: number): Promise<NewsAssetsPage> {
  const positions = listAssetNewsPositions(userId);
  if (!positions.length) return { articles: [], limit, offset, totalAssets: 0, queriedAssets: 0, hasMore: false };

  const cacheKey = aggregateCacheKey(positions, languages, userId, limit, offset);
  let aggregate = assetNewsRepository.readAggregateCache(cacheKey, aggregateCacheTtlSeconds);
  if (!aggregate) {
    const built = await buildAggregate(positions, languages, limit, offset);
    aggregate = built.aggregate;
    if (built.complete) assetNewsRepository.writeAggregateCache(cacheKey, aggregate, aggregateCacheTtlSeconds);
  }
  return { ...aggregate, articles: annotateEarningsArticles(aggregate.articles, config.appTimezone), limit, offset };
}
