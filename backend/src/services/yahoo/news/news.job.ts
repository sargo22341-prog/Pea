import type { NewsArticle, NewsFeedPage, NewsLanguage } from "@pea/shared";
import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { dedupeInFlight } from "../../shared/inFlightDeduper.js";
import { logger } from "../../shared/logger.service.js";
import { retryTemporary } from "../yahoo.client.js";
import { yahooSearch, type YahooSearchRaw } from "../yahoo.raw.js";
import { prefetchNewsFeed, readNewsStaleWhileRevalidate, type NewsFetcher } from "./news-cache-policy.js";
import { companyNewsMatcher, dedupeNewsArticles, filterNewsByExactTicker, globalNewsOptions, globalNewsQueries, newsOptions, normalizeNewsLanguages, sortNewsByDateDesc } from "./news.filters.js";
import { companyNewsCacheKey, globalNewsCacheKey, newsCacheKey } from "./news.keys.js";
import { normalizeNewsArticles, searchQuoteName } from "./news.mapper.js";

const globalNewsPageSize = 20;

/** Recupere les news liees a un ticker dans toutes les langues demandees. */
export async function fetchNews(symbol: string, languages?: NewsLanguage[]): Promise<MarketDataResult<NewsArticle[]>> {
  const key = symbol.trim().toUpperCase();
  if (!key) return { data: [], stale: false };
  return mergeLanguageFeeds(languages, (language) =>
    readNewsStaleWhileRevalidate(newsCacheKey(key, language), tickerNewsFetcher(key, language), { symbol: key, language }));
}

/** Cherche les news d'une entreprise directement par nom, sans prefiltre ticker. */
export async function fetchCompanyNews(symbol: string, companyName: string, languages?: NewsLanguage[]): Promise<MarketDataResult<NewsArticle[]>> {
  const key = symbol.trim().toUpperCase();
  const query = companyName.trim();
  if (!key || !query) return { data: [], stale: false };
  return mergeLanguageFeeds(languages, (language) =>
    readNewsStaleWhileRevalidate(companyNewsCacheKey(key, language, query), companyNewsFetcher(key, query, language), { symbol: key, language, query }));
}

/** Recupere le flux global et applique la pagination API historique. */
export async function fetchGlobalNews(page: number, languages?: NewsLanguage[]): Promise<NewsFeedPage> {
  const { data: articles } = await mergeLanguageFeeds(languages, (language) =>
    readNewsStaleWhileRevalidate(globalNewsCacheKey(language), globalNewsFetcher(language), { feed: "global", language }));
  const total = articles.length;
  const totalPages = Math.ceil(total / globalNewsPageSize);
  const safePage = Math.max(1, Math.min(page, totalPages || 1));
  const start = (safePage - 1) * globalNewsPageSize;
  return {
    articles: articles.slice(start, start + globalNewsPageSize),
    page: safePage,
    pageSize: globalNewsPageSize,
    total,
    totalPages
  };
}

/** Précharge les flux d'une entreprise plus vieux que `maxAgeSeconds` ; renvoie le nombre de flux rafraîchis. */
export async function prefetchCompanyNews(symbol: string, companyName: string, languages: NewsLanguage[], maxAgeSeconds: number) {
  const key = symbol.trim().toUpperCase();
  const query = companyName.trim();
  if (!key || !query) return 0;
  let refreshed = 0;
  for (const language of normalizeNewsLanguages(languages)) {
    if (await prefetchNewsFeed(companyNewsCacheKey(key, language, query), companyNewsFetcher(key, query, language), maxAgeSeconds)) refreshed += 1;
  }
  return refreshed;
}

/** Précharge le flux global de chaque langue plus vieux que `maxAgeSeconds` ; renvoie le nombre de flux rafraîchis. */
export async function prefetchGlobalNews(languages: NewsLanguage[], maxAgeSeconds: number) {
  let refreshed = 0;
  for (const language of normalizeNewsLanguages(languages)) {
    if (await prefetchNewsFeed(globalNewsCacheKey(language), globalNewsFetcher(language), maxAgeSeconds)) refreshed += 1;
  }
  return refreshed;
}

async function mergeLanguageFeeds(
  languages: NewsLanguage[] | undefined,
  readFeed: (language: NewsLanguage) => Promise<MarketDataResult<NewsArticle[]>>
): Promise<MarketDataResult<NewsArticle[]>> {
  const results = await Promise.all(normalizeNewsLanguages(languages).map(readFeed));
  const data = sortNewsByDateDesc(dedupeNewsArticles(results.flatMap((result) => result.data)));
  return { data, stale: results.some((result) => result.stale) };
}

function searchNews(callKey: string, query: string, options: Record<string, unknown>): Promise<YahooSearchRaw> {
  return dedupeInFlight(callKey, () => {
    logger.debug("news", "yahoo-call", { callKey, query, options });
    return retryTemporary(callKey, () => yahooSearch(query, options));
  });
}

/**
 * Articles qui citent explicitement le ticker ; à défaut, recherche par le nom proposé par Yahoo
 * filtrée sur le symbole court et les mots significatifs du nom.
 */
function tickerNewsFetcher(key: string, language: NewsLanguage): NewsFetcher {
  return async () => {
    const options = newsOptions(language);
    const result = await searchNews(`news:${key}:${language}`, key, options);
    const primaryArticles = normalizeNewsArticles(result.news);
    const payload = filterNewsByExactTicker(key, primaryArticles);
    logger.debug("news", "filtered", { symbol: key, beforeCount: primaryArticles.length, afterCount: payload.length });
    if (payload.length) return payload;

    const companyName = searchQuoteName(result);
    if (!companyName || companyName.toUpperCase() === key) return payload;
    const fallbackArticles = normalizeNewsArticles((await searchNews(`news:${key}:${language}:${companyName}`, companyName, options)).news);
    const fallback = fallbackArticles.filter(companyNewsMatcher(key, companyName));
    logger.debug("news", "filtered", { symbol: key, beforeCount: fallbackArticles.length, afterCount: fallback.length });
    return fallback;
  };
}

function companyNewsFetcher(key: string, query: string, language: NewsLanguage): NewsFetcher {
  return async () => {
    const articles = normalizeNewsArticles((await searchNews(`news:company:${key}:${language}:${query}`, query, newsOptions(language))).news);
    const payload = articles.filter(companyNewsMatcher(key, query));
    logger.debug("news", "company filtered", { symbol: key, language, query, beforeCount: articles.length, afterCount: payload.length });
    return payload;
  };
}

/** Flux global : plusieurs requêtes génériques à la suite ; un résultat vide conserve le cache existant. */
function globalNewsFetcher(language: NewsLanguage): NewsFetcher {
  return async () => {
    const options = globalNewsOptions(language, globalNewsPageSize);
    const results: YahooSearchRaw[] = [];
    for (const query of globalNewsQueries(language)) {
      results.push(await searchNews(`news:global:${language}:${query}`, query, options));
    }
    const payload = sortNewsByDateDesc(dedupeNewsArticles(results.flatMap((item) => normalizeNewsArticles(item.news))));
    return payload.length ? payload : null;
  };
}
