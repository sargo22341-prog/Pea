import type { NewsArticle, NewsAssetsPage, User } from "@pea/shared";
import { api } from "../../../lib/api";
import { createInFlightRegistry, createNewsListeners, debugNews, newsArticleIdentity, sortNewsArticlesByDate, trimMapByInsertion } from "./newsCache";

const assetNewsBatchSize = 8;
const maxCachedUsers = 10;

export interface AssetNewsSnapshot {
  articles: NewsArticle[];
  loadedAt: number;
  fullyLoaded: boolean;
}

interface AssetNewsEntry extends AssetNewsSnapshot {
  loadedOffsets: ReadonlySet<number>;
  totalAssets: number | null;
}

const emptyEntry: AssetNewsEntry = { articles: [], loadedAt: 0, fullyLoaded: false, loadedOffsets: new Set(), totalAssets: null };
const entries = new Map<string, AssetNewsEntry>();
const listeners = createNewsListeners();
const shareLoad = createInFlightRegistry();

export const subscribeAssetNews = listeners.subscribe;

function userKey(user: User) {
  return `assets:${user.id}:${user.newsLanguages.join(",")}`;
}

/** Actualités affichables (premier lot chargé) ; même référence tant qu'elles ne changent pas. */
export function assetNewsSnapshot(user: User): AssetNewsSnapshot | null {
  const entry = entries.get(userKey(user));
  return entry?.loadedOffsets.has(0) ? entry : null;
}

/** Fusionne un article déjà connu en conservant tous les actifs liés. */
function mergeRelatedAssets(existing: NewsArticle | undefined, incoming: NewsArticle) {
  if (!existing) return incoming;
  const relatedAssets = [...(existing.relatedAssets ?? [])];
  for (const asset of incoming.relatedAssets ?? []) {
    if (!relatedAssets.some((known) => known.symbol === asset.symbol)) relatedAssets.push(asset);
  }
  return { ...existing, relatedAssets };
}

/** Nouvelle entrée intégrant un lot : dédoublonnée, triée par date, sans muter la précédente. */
function mergeBatch(entry: AssetNewsEntry, offset: number, page: NewsAssetsPage): AssetNewsEntry {
  const articlesByIdentity = new Map(entry.articles.map((article) => [newsArticleIdentity(article), article]));
  for (const article of page.articles) {
    const key = newsArticleIdentity(article);
    articlesByIdentity.set(key, mergeRelatedAssets(articlesByIdentity.get(key), article));
  }
  const loadedOffsets = new Set(entry.loadedOffsets).add(offset);
  return {
    articles: sortNewsArticlesByDate([...articlesByIdentity.values()]),
    loadedAt: offset === 0 ? Date.now() : entry.loadedAt,
    fullyLoaded: !page.hasMore || loadedOffsets.size * assetNewsBatchSize >= page.totalAssets,
    loadedOffsets,
    totalAssets: page.totalAssets
  };
}

function nextOffset(entry: AssetNewsEntry) {
  if (entry.fullyLoaded) return null;
  for (let offset = 0; entry.totalAssets === null || offset < entry.totalAssets; offset += assetNewsBatchSize) {
    if (!entry.loadedOffsets.has(offset)) return offset;
  }
  return null;
}

/** Charge les lots manquants un par un ; `commit` reçoit chaque étape et peut arrêter la boucle. */
async function loadMissingBatches(entry: AssetNewsEntry, commit: (next: AssetNewsEntry) => boolean) {
  let current = entry;
  for (let offset = nextOffset(current); offset !== null; offset = nextOffset(current)) {
    debugNews("lot actifs", { endpoint: `/api/news-assets?limit=${assetNewsBatchSize}&offset=${offset}` });
    current = mergeBatch(current, offset, await api.assetNews(assetNewsBatchSize, offset));
    if (!commit(current)) return current;
  }
  return current;
}

function store(key: string, entry: AssetNewsEntry) {
  entries.set(key, entry);
  trimMapByInsertion(entries, maxCachedUsers);
  listeners.notify();
}

/**
 * Charge le premier lot puis les suivants, chaque lot étant publié aux abonnés. S'arrête si une
 * revalidation a remplacé l'entrée entre-temps.
 */
export function ensureAssetNews(user: User): Promise<void> {
  const key = userKey(user);
  return shareLoad(`ensure:${key}`, async () => {
    let expected = entries.get(key);
    await loadMissingBatches(expected ?? emptyEntry, (next) => {
      if (entries.get(key) !== expected) return false;
      expected = next;
      store(key, next);
      return true;
    });
  });
}

/** Recharge tous les lots dans une nouvelle entrée, publiée d'un seul bloc une fois complète. */
export function revalidateAssetNews(user: User): Promise<void> {
  const key = userKey(user);
  return shareLoad(`revalidate:${key}`, async () => {
    store(key, await loadMissingBatches(emptyEntry, () => true));
  });
}
