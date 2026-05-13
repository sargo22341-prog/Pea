import type { NewsArticle, NewsFeedPage, NewsLanguage } from "@pea/shared";
import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { dedupeInFlight } from "../../shared/inFlightDeduper.js";
import { logger } from "../../shared/logger.service.js";
import { readNewsCache, writeNewsCache } from "../cache/news.cache.js";
import { retryTemporary } from "../yahoo.client.js";
import { errorMessage } from "../yahoo.errors.js";
import { yahooSearch, type YahooSearchRaw } from "../yahoo.raw.js";
import { dedupeNewsArticles, filterNewsByExactTicker, filterNewsByFallbackKeywords, globalNewsOptions, globalNewsQueries, newsOptions, normalizeNewsLanguages, sortNewsByDateDesc } from "./news.filters.js";
import { companyNewsCacheKey, globalNewsCacheKey, newsCacheKey } from "./news.keys.js";
import { normalizeNewsArticles, searchQuoteName } from "./news.mapper.js";

/** Recupere les news liees a un ticker dans toutes les langues demandees. */
export async function fetchNews(symbol: string, languages?: NewsLanguage[]): Promise<MarketDataResult<NewsArticle[]>> {
  const activeLanguages = normalizeNewsLanguages(languages);
  const results = await Promise.all(activeLanguages.map((language) => tickerNewsByLanguage(symbol, language)));
  const data = sortNewsByDateDesc(dedupeNewsArticles(results.flatMap((result) => result.data)));
  return { data, stale: results.some((result) => result.stale) };
}

/** Cherche les news d'une entreprise directement par nom, sans prefiltre ticker. */
export async function fetchCompanyNews(symbol: string, companyName: string, languages?: NewsLanguage[]): Promise<MarketDataResult<NewsArticle[]>> {
  const activeLanguages = normalizeNewsLanguages(languages);
  const results = await Promise.all(activeLanguages.map((language) => companyNewsByLanguage(symbol, companyName, language)));
  const data = sortNewsByDateDesc(dedupeNewsArticles(results.flatMap((result) => result.data)));
  return { data, stale: results.some((result) => result.stale) };
}

/** Recupere le flux global et applique la pagination API historique. */
export async function fetchGlobalNews(page: number, languages?: NewsLanguage[]): Promise<NewsFeedPage> {
  const pageSize = 20;
  const activeLanguages = normalizeNewsLanguages(languages);
  const results = await Promise.all(activeLanguages.map((language) => globalNewsByLanguage(language)));
  const articles = sortNewsByDateDesc(dedupeNewsArticles(results.flatMap((result) => result.data)));
  const total = articles.length;
  const totalPages = Math.ceil(total / pageSize);
  const safePage = Math.max(1, Math.min(page, totalPages || 1));
  const start = (safePage - 1) * pageSize;
  return {
    articles: articles.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages
  };
}

async function tickerNewsByLanguage(symbol: string, language: NewsLanguage): Promise<MarketDataResult<NewsArticle[]>> {
  const key = symbol.trim().toUpperCase();
  if (!key) return { data: [], stale: false };

  const cacheKey = newsCacheKey(key, language);
  const cached = readNewsCache(cacheKey);
  if (cached && !cached.stale) {
    logger.debug("news", "cache-hit", { symbol: key, language, count: cached.data.length });
    return cached;
  }

  logger.debug("news", "cache-miss", { symbol: key, language });
  const options = newsOptions(language);

  try {
    const result = await dedupeInFlight(`news:${key}:${language}`, async (): Promise<YahooSearchRaw> => {
      logger.debug("news", "yahoo-call", { symbol: key, language, query: key, options });
      return retryTemporary(`news:${key}:${language}`, () => yahooSearch(key, options));
    });

    const primaryArticles = normalizeNewsArticles(result?.news);
    let payload = filterNewsByExactTicker(key, primaryArticles);
    logger.debug("news", "filtered", { symbol: key, beforeCount: primaryArticles.length, afterCount: payload.length });

    if (!payload.length) {
      const companyName = searchQuoteName(result);
      if (companyName && companyName.toUpperCase() !== key) {
        const fallbackResult = await dedupeInFlight(`news:${key}:${language}:${companyName}`, async (): Promise<YahooSearchRaw> => {
          logger.debug("news", "yahoo-call", { symbol: key, language, query: companyName, options });
          return retryTemporary(`news:${key}:${language}:${companyName}`, () => yahooSearch(companyName, options));
        });
        const fallbackArticles = normalizeNewsArticles(fallbackResult?.news);
        payload = filterNewsByFallbackKeywords(key, companyName, fallbackArticles);
        logger.debug("news", "filtered", { symbol: key, beforeCount: fallbackArticles.length, afterCount: payload.length });
      }
    }

    if (!payload.length) {
      logger.debug("news", "no-related-articles", { symbol: key });
    }

    writeNewsCache(cacheKey, payload);
    return { data: payload, stale: false };
  } catch (error) {
    logger.warn("news", "Yahoo news error", { symbol: key, language, error: errorMessage(error) });
    return { data: [], stale: false };
  }
}

async function companyNewsByLanguage(symbol: string, companyName: string, language: NewsLanguage): Promise<MarketDataResult<NewsArticle[]>> {
  const key = symbol.trim().toUpperCase();
  const query = companyName.trim();
  if (!key || !query) return { data: [], stale: false };

  const cacheKey = companyNewsCacheKey(key, language, query);
  const cached = readNewsCache(cacheKey);
  if (cached && !cached.stale) {
    logger.debug("news", "company cache-hit", { symbol: key, language, query, count: cached.data.length });
    return cached;
  }

  const options = newsOptions(language);
  try {
    const result = await dedupeInFlight(`news:company:${key}:${language}:${query}`, async (): Promise<YahooSearchRaw> => {
      logger.debug("news", "company yahoo-call", { symbol: key, language, query, options });
      return retryTemporary(`news:company:${key}:${language}:${query}`, () => yahooSearch(query, options));
    });

    const articles = normalizeNewsArticles(result?.news);
    const payload = filterNewsByFallbackKeywords(key, query, articles);
    logger.debug("news", "company filtered", { symbol: key, language, query, beforeCount: articles.length, afterCount: payload.length });
    writeNewsCache(cacheKey, payload);
    return { data: payload, stale: false };
  } catch (error) {
    logger.warn("news", "Yahoo company news error", { symbol: key, language, query, error: errorMessage(error) });
    return { data: cached?.data ?? [], stale: Boolean(cached) };
  }
}

async function globalNewsByLanguage(language: NewsLanguage): Promise<MarketDataResult<NewsArticle[]>> {
  const cacheKey = globalNewsCacheKey(language);
  const cached = readNewsCache(cacheKey);
  if (cached && !cached.stale) {
    logger.debug("news", "global cache-hit", { language, count: cached.data.length });
    return cached;
  }

  const options = globalNewsOptions(language, 20);

  try {
    const result = await dedupeInFlight(`news:global:${language}`, async (): Promise<YahooSearchRaw[]> => {
      const results: YahooSearchRaw[] = [];
      for (const query of globalNewsQueries(language)) {
        logger.debug("news", "global yahoo-call", { language, query, options });
        results.push(await retryTemporary(`news:global:${language}:${query}`, () => yahooSearch(query, options)));
      }
      return results;
    });
    const payload = sortNewsByDateDesc(dedupeNewsArticles(result.flatMap((item) => normalizeNewsArticles(item?.news))));
    if (payload.length) writeNewsCache(cacheKey, payload);
    return { data: payload, stale: false };
  } catch (error) {
    logger.warn("news", "Yahoo global news error", { language, error: errorMessage(error) });
    return { data: cached?.data ?? [], stale: Boolean(cached) };
  }
}
