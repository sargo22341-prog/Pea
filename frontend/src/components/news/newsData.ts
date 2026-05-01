/**
 * Role du fichier : centraliser le cache, les appels API et les prechargements
 * utilises uniquement par la page Actualite.
 */

import type { NewsArticle, NewsAssetsPage, NewsFeedPage, User } from "@pea/shared";
import type { Dispatch, SetStateAction } from "react";
import { api } from "../../lib/api";
import type { AssetNewsCacheEntry, AsyncNewsState, NewsMode } from "./newsTypes";

export const newsPageSize = 20;
export const portfolioOnlyStorageKey = "pea.news.portfolioOnly";

const assetNewsBatchSize = 8;
const assetNewsCache = new Map<string, AssetNewsCacheEntry>();
const globalNewsCache = new Map<string, NewsFeedPage>();
const assetNewsInFlight = new Map<string, Promise<NewsAssetsPage>>();
const assetNewsBackgroundInFlight = new Map<string, Promise<void>>();
const globalNewsInFlight = new Map<string, Promise<NewsFeedPage>>();
const newsDebugEnabled = __APP_DEBUG__;

export function readInitialPortfolioMode() {
  const stored = window.localStorage.getItem(portfolioOnlyStorageKey);
  return stored === null ? true : stored === "true";
}

export function getCachedAssetArticles(user: User) {
  return assetNewsCache.get(assetCacheKey(user))?.articles ?? null;
}

export function getCachedGlobalNews(user: User, page: number) {
  return globalNewsCache.get(globalCacheKey(user, page)) ?? null;
}

/**
 * Indique si un mode possede deja une entree en cache.
 */
export function hasModeCache(user: User, mode: NewsMode, globalPage: number) {
  return mode === "assets" ? assetNewsCache.get(assetCacheKey(user))?.loadedOffsets.has(0) === true : globalNewsCache.has(globalCacheKey(user, globalPage));
}

/**
 * Charge les actualites d'actifs pour le mode actif.
 */
export async function loadAssetMode(
  user: User,
  signal: AbortSignal,
  setState: Dispatch<SetStateAction<AsyncNewsState<NewsArticle[]>>>,
  reason: string
) {
  const key = assetCacheKey(user);
  const cached = assetNewsCache.get(key);
  if (cached?.loadedOffsets.has(0)) {
    debugNews("cache hit", { mode: "assets", endpoint: "/api/news-assets", reason });
    setState({ data: cached.articles, loading: false, error: null });
    void preloadRemainingAssetNews(user, signal, setState);
    return;
  }

  debugNews("endpoint appele en premier ou switch cache miss", {
    mode: "assets",
    endpoint: `/api/news-assets?limit=${assetNewsBatchSize}&offset=0`,
    reason
  });
  setState((current) => ({ ...current, loading: true, error: null }));
  try {
    const data = await fetchAssetNewsPage(user, 0);
    if (!signal.aborted) {
      setState({ data, loading: false, error: null });
      void preloadRemainingAssetNews(user, signal, setState);
    }
  } catch (error) {
    if (!signal.aborted) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Actualites indisponibles" }));
  }
}

/**
 * Charge les actualites globales pour le mode actif.
 */
export async function loadGlobalMode(
  user: User,
  page: number,
  signal: AbortSignal,
  setState: Dispatch<SetStateAction<AsyncNewsState<NewsFeedPage>>>,
  reason: string
) {
  const key = globalCacheKey(user, page);
  const cached = globalNewsCache.get(key);
  if (cached) {
    debugNews("cache hit", { mode: "global", endpoint: `/api/news-global?page=${page}`, reason });
    setState({ data: cached, loading: false, error: null });
    return;
  }

  debugNews("endpoint appele en premier ou switch cache miss", { mode: "global", endpoint: `/api/news-global?page=${page}`, reason });
  setState((current) => ({ ...current, loading: true, error: null }));
  try {
    const data = await fetchGlobalNews(user, page);
    if (!signal.aborted) setState({ data, loading: false, error: null });
  } catch (error) {
    if (!signal.aborted) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Actualites indisponibles" }));
  }
}

/**
 * Precharge les actualites globales apres le chargement complet du mode actif.
 */
export async function preloadGlobalMode(user: User, page: number) {
  const key = globalCacheKey(user, page);
  if (globalNewsCache.has(key) || globalNewsInFlight.has(key)) return;
  debugNews("prechargement", { mode: "global", endpoint: `/api/news-global?page=${page}` });
  await fetchGlobalNews(user, page).catch((error) => {
    debugNews("prechargement echoue", { mode: "global", error: error instanceof Error ? error.message : String(error) });
  });
}

/**
 * Precharge les actualites d'actifs apres le chargement complet du mode global.
 */
export async function preloadAssetMode(user: User) {
  const key = assetCacheKey(user);
  if (assetNewsCache.get(key)?.loadedOffsets.has(0) || assetNewsInFlight.has(assetPageCacheKey(user, 0))) return;
  debugNews("prechargement", { mode: "assets", endpoint: `/api/news-assets?limit=${assetNewsBatchSize}&offset=0` });
  await fetchAssetNewsPage(user, 0).then(() => preloadRemainingAssetNews(user)).catch((error) => {
    debugNews("prechargement echoue", { mode: "assets", error: error instanceof Error ? error.message : String(error) });
  });
}

/**
 * Precharge les lots restants d'actualites d'actifs apres la premiere vague.
 */
export function preloadRemainingAssetNews(
  user: User,
  signal?: AbortSignal,
  setState?: Dispatch<SetStateAction<AsyncNewsState<NewsArticle[]>>>
) {
  const key = assetCacheKey(user);
  const running = assetNewsBackgroundInFlight.get(key);
  if (running) return running;

  const task = (async () => {
    let entry = getAssetNewsCacheEntry(user);
    let nextOffset = assetNewsBatchSize;
    while (!signal?.aborted && !entry.fullyLoaded && (entry.totalAssets === null || nextOffset < entry.totalAssets)) {
      if (entry.loadedOffsets.has(nextOffset)) {
        nextOffset += assetNewsBatchSize;
        continue;
      }
      debugNews("prechargement suite actifs", {
        endpoint: `/api/news-assets?limit=${assetNewsBatchSize}&offset=${nextOffset}`,
        offset: nextOffset
      });
      await fetchAssetNewsPage(user, nextOffset);
      entry = getAssetNewsCacheEntry(user);
      if (!signal?.aborted && setState) setState({ data: entry.articles, loading: false, error: null });
      nextOffset += assetNewsBatchSize;
    }
  })().finally(() => {
    assetNewsBackgroundInFlight.delete(key);
  });

  assetNewsBackgroundInFlight.set(key, task);
  return task;
}

export function debugNews(message: string, details: Record<string, unknown>) {
  if (newsDebugEnabled) console.debug(`[news] ${message}`, details);
}

/**
 * Construit la cle de cache des actualites d'actifs selon les preferences utilisateur.
 */
function assetCacheKey(user: User) {
  return `assets:${user.id}:${user.newsLanguages.join(",")}`;
}

/**
 * Construit la cle de cache des actualites globales selon la page et les langues.
 */
function globalCacheKey(user: User, page: number) {
  return `global:${user.id}:${user.newsLanguages.join(",")}:page:${page}`;
}

/**
 * Recupere une vague d'actualites d'actifs avec deduplication et cache local.
 */
function fetchAssetNewsPage(user: User, offset: number) {
  const pageKey = assetPageCacheKey(user, offset);
  const entry = getAssetNewsCacheEntry(user);
  if (entry.loadedOffsets.has(offset)) return Promise.resolve(entry.articles);
  const existing = assetNewsInFlight.get(pageKey);
  if (existing) return existing.then(() => getAssetNewsCacheEntry(user).articles);

  // Le cache in-flight ne recoit pas le signal React : un rendu annule ne doit
  // pas contaminer la promesse partagee par le rendu suivant ou par le prechargement.
  const request = api.assetNews(assetNewsBatchSize, offset).then((page) => {
    mergeAssetNewsPage(user, page);
    return page;
  }).finally(() => {
    assetNewsInFlight.delete(pageKey);
  });
  assetNewsInFlight.set(pageKey, request);
  return request.then(() => getAssetNewsCacheEntry(user).articles);
}

/**
 * Construit la cle d'un lot d'actualites d'actifs.
 */
function assetPageCacheKey(user: User, offset: number) {
  return `${assetCacheKey(user)}:limit:${assetNewsBatchSize}:offset:${offset}`;
}

/**
 * Retourne l'entree de cache locale des actualites d'actifs.
 */
function getAssetNewsCacheEntry(user: User) {
  const key = assetCacheKey(user);
  const existing = assetNewsCache.get(key);
  if (existing) return existing;
  const created: AssetNewsCacheEntry = { articles: [], loadedOffsets: new Set<number>(), totalAssets: null, fullyLoaded: false };
  assetNewsCache.set(key, created);
  return created;
}

/**
 * Fusionne un lot backend dans le cache local en dedupliquant puis en triant par date.
 */
function mergeAssetNewsPage(user: User, page: NewsAssetsPage) {
  const entry = getAssetNewsCacheEntry(user);
  const articlesByIdentity = new Map<string, NewsArticle>();
  for (const article of entry.articles) articlesByIdentity.set(newsArticleIdentity(article), article);
  for (const article of page.articles) {
    const key = newsArticleIdentity(article);
    articlesByIdentity.set(key, mergeRelatedAssets(articlesByIdentity.get(key), article));
  }
  entry.articles = sortNewsArticlesByDate([...articlesByIdentity.values()]);
  entry.loadedOffsets.add(page.offset);
  entry.totalAssets = page.totalAssets;
  entry.fullyLoaded = !page.hasMore || entry.loadedOffsets.size * assetNewsBatchSize >= page.totalAssets;
  return entry;
}

/**
 * Calcule l'identite stable d'un article pour eviter les doublons entre vagues.
 */
function newsArticleIdentity(article: NewsArticle) {
  return article.url || `${article.title}:${article.publishedAt ?? ""}`;
}

/**
 * Fusionne deux occurrences du meme article en conservant tous les actifs lies.
 */
function mergeRelatedAssets(existing: NewsArticle | undefined, incoming: NewsArticle) {
  if (!existing) return incoming;
  const relatedAssets = [...(existing.relatedAssets ?? [])];
  for (const asset of incoming.relatedAssets ?? []) {
    if (!relatedAssets.some((known) => known.symbol === asset.symbol)) relatedAssets.push(asset);
  }
  return { ...existing, relatedAssets };
}

/**
 * Trie les actualites par date de publication decroissante.
 */
function sortNewsArticlesByDate(articles: NewsArticle[]) {
  return [...articles].sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });
}

/**
 * Recupere les actualites globales avec deduplication et cache local.
 */
function fetchGlobalNews(user: User, page: number) {
  const key = globalCacheKey(user, page);
  const cached = globalNewsCache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = globalNewsInFlight.get(key);
  if (existing) return existing;

  // Le cache in-flight reste independant des AbortSignal pour eviter d'afficher
  // une erreur d'annulation lors d'un remount React ou d'un changement rapide de mode.
  const request = api.globalNews(page).then((pageData) => {
    globalNewsCache.set(key, pageData);
    return pageData;
  }).finally(() => {
    globalNewsInFlight.delete(key);
  });
  globalNewsInFlight.set(key, request);
  return request;
}
