import express from "express";
import { z } from "zod";
import type { NewsArticle } from "@pea/shared";
import { config } from "../../config.js";
import { marketDataGateway } from "../../services/market/data/market-data-gateway.service.js";
import { logger } from "../../services/shared/logger.service.js";
import { annotateEarningsArticles } from "../../services/news/earnings-news.js";
import { asyncRoute } from "../shared/async-route.js";
import { sortArticlesByDateDesc, userNewsLanguages } from "../shared/news.helpers.js";
import { requireAuthUser } from "../../middleware/auth.js";
import { symbolParam } from "../shared/symbol.js";
import {
  type AssetNewsCandidate,
  assetNewsAggregateCacheKey,
  companyNewsQuery,
  defaultAssetNewsLimit,
  listAssetNewsPositionRows,
  maxAssetNewsLimit,
  readAssetNewsAggregateCache,
  readStoredAssetNewsMetadata,
  shouldSkipAssetSpecificNews,
  writeAssetNewsAggregateCache
} from "./asset-news.helpers.js";

export const newsRouter = express.Router();

newsRouter.get("/news-global", asyncRoute(async (req, res) => {
  if (!requireAuthUser(req).assetNewsEnabled) {
    res.json({ articles: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    return;
  }
  const page = Math.max(1, z.coerce.number().int().optional().default(1).parse(req.query["page"]));
  res.json(await marketDataGateway.readGlobalNewsWithCache(page, userNewsLanguages(req)));
}));

newsRouter.get("/news-assets", asyncRoute(async (req, res) => {
  const startedAt = performance.now();
  const limit = Math.min(maxAssetNewsLimit, Math.max(1, z.coerce.number().int().optional().default(defaultAssetNewsLimit).parse(req.query["limit"])));
  const offset = Math.max(0, z.coerce.number().int().optional().default(0).parse(req.query["offset"]));
  if (!requireAuthUser(req).assetNewsEnabled) {
    res.json({ articles: [], limit, offset, totalAssets: 0, queriedAssets: 0, hasMore: false });
    return;
  }
  const positions = listAssetNewsPositionRows(requireAuthUser(req).id);
  if (!positions.length) {
    res.json({ articles: [], limit, offset, totalAssets: 0, queriedAssets: 0, hasMore: false });
    return;
  }
  const languages = userNewsLanguages(req);

  const positionsBySymbol = new Map(positions.map((position) => [position.symbol.toUpperCase(), position]));
  let skippedEtfFunds = 0;
  const candidates: AssetNewsCandidate[] = [];
  for (const position of positions) {
    const metadata = readStoredAssetNewsMetadata(position.symbol);
    const skip = shouldSkipAssetSpecificNews({
      symbol: position.symbol,
      name: metadata.name ?? position.name,
      quoteType: metadata.quoteType,
      assetType: metadata.assetType
    });
    if (skip) {
      skippedEtfFunds += 1;
      logger.debug("news", "asset news skipped ETF/fund", { symbol: position.symbol, name: metadata.name ?? position.name, quoteType: metadata.quoteType, assetType: metadata.assetType });
      continue;
    }
    candidates.push({
      position,
      query: companyNewsQuery(metadata.name ?? position.name, position.symbol),
      positionValue: position.quantity * position.average_buy_price
    });
  }
  const sortedCandidates = candidates.sort((a, b) => b.positionValue - a.positionValue);
  const stockPositions = sortedCandidates.slice(offset, offset + limit);
  const hasMore = offset + limit < sortedCandidates.length;
  const aggregateCacheKey = assetNewsAggregateCacheKey(positions, languages, requireAuthUser(req).id, limit, offset);
  const cachedArticles = readAssetNewsAggregateCache(aggregateCacheKey);
  if (cachedArticles) {
    logger.debug("news", "asset news aggregate cache-hit", {
      quoteBatchUsed: false,
      totalPositions: positions.length,
      skippedEtfFunds,
      candidateStocks: sortedCandidates.length,
      offset,
      limit,
      queriedStocks: stockPositions.length,
      articles: cachedArticles.length,
      hasMore,
      durationMs: Math.round(performance.now() - startedAt)
    });
    res.json({ articles: annotateEarningsArticles(cachedArticles, config.appTimezone), limit, offset, totalAssets: sortedCandidates.length, queriedAssets: stockPositions.length, hasMore });
    return;
  }
  logger.debug("news", "asset news optimized plan", {
    quoteBatchUsed: false,
    totalPositions: positions.length,
    skippedEtfFunds,
    candidateStocks: sortedCandidates.length,
    offset,
    limit,
    hasMore,
    queriedStocks: stockPositions.length,
    queries: stockPositions.map((candidate) => `${candidate.position.symbol}:${candidate.query}`).join(",")
  });

  const results = await Promise.all(
    stockPositions.map(async (candidate) => {
      const feed = await marketDataGateway.readCompanyNewsWithCache(candidate.position.symbol, candidate.query, languages).catch((error: unknown) => {
        logger.warn("news", "asset company feed fallback", { symbol: candidate.position.symbol, query: candidate.query, error: error instanceof Error ? error.message : String(error) });
        return { data: [] as NewsArticle[] };
      });
      return { position: candidate.position, articles: feed.data };
    })
  );
  const articlesByUrl = new Map<string, NewsArticle>();
  for (const { position, articles: feedArticles } of results) {
    for (const article of feedArticles) {
      const existing = articlesByUrl.get(article.url);
      const relatedAssets = existing?.relatedAssets ?? [];
      if (!relatedAssets.some((asset) => asset.symbol === position.symbol)) {
        relatedAssets.push({ symbol: position.symbol, name: positionsBySymbol.get(position.symbol.toUpperCase())?.name ?? position.name });
      }
      articlesByUrl.set(article.url, { ...(existing ?? article), relatedAssets });
    }
  }
  const articles = sortArticlesByDateDesc([...articlesByUrl.values()]).slice(0, 200);
  writeAssetNewsAggregateCache(aggregateCacheKey, articles);
  logger.debug("news", "asset news timing", {
    quoteBatchUsed: false,
    totalPositions: positions.length,
    skippedEtfFunds,
    candidateStocks: sortedCandidates.length,
    offset,
    limit,
    queriedStocks: stockPositions.length,
    hasMore,
    articles: articles.length,
    durationMs: Math.round(performance.now() - startedAt)
  });
  res.json({ articles: annotateEarningsArticles(articles, config.appTimezone), limit, offset, totalAssets: sortedCandidates.length, queriedAssets: stockPositions.length, hasMore });
}));

newsRouter.get("/news/:symbol", asyncRoute(async (req, res) => {
  if (!requireAuthUser(req).assetNewsEnabled) {
    res.json([]);
    return;
  }
  const result = await marketDataGateway.readNewsWithCache(symbolParam(req.params["symbol"]), userNewsLanguages(req));
  res.json(result.data);
}));
