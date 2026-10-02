import type { NewsArticle } from "@pea/shared";
import { i18n } from "../../../i18n";

/** Âge au-delà duquel les actualités affichées sont rechargées en arrière-plan. */
export const newsCacheTtlMs = 10 * 60_000;
/** Âge minimal avant de recharger au retour sur l'onglet, pour ignorer les allers-retours rapides. */
export const newsForegroundRevalidateMs = 60_000;
/** Plafond des requêtes d'actualités simultanées, contre un emballement de rechargements. */
export const maxNewsInFlightRequests = 50;

const newsDebugEnabled = __APP_DEBUG__;

export function debugNews(message: string, details: Record<string, unknown>) {
  if (newsDebugEnabled) console.debug(`[news] ${message}`, details);
}

export function isOlderThan(loadedAt: number, ageMs: number, now = Date.now()) {
  return now - loadedAt >= ageMs;
}

/** Identité stable d'un article entre deux chargements. */
export function newsArticleIdentity(article: NewsArticle) {
  return article.url || `${article.title}:${article.publishedAt ?? ""}`;
}

/** Nombre d'articles de `latest` absents de `displayed`. */
export function countNewArticles(displayed: readonly NewsArticle[], latest: readonly NewsArticle[]) {
  const known = new Set(displayed.map(newsArticleIdentity));
  return latest.filter((article) => !known.has(newsArticleIdentity(article))).length;
}

export function sortNewsArticlesByDate(articles: NewsArticle[]) {
  return [...articles].sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });
}

export function trimMapByInsertion<TKey, TValue>(cache: Map<TKey, TValue>, maxEntries: number) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) return;
    cache.delete(oldestKey);
  }
}

/** Abonnés d'un magasin d'actualités, prévenus à chaque changement de données. */
export function createNewsListeners() {
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    notify: () => {
      for (const listener of listeners) listener();
    }
  };
}

/** Partage un chargement par clé tant qu'il est en cours. */
export function createInFlightRegistry() {
  const inFlight = new Map<string, Promise<void>>();
  return function share(key: string, start: () => Promise<void>): Promise<void> {
    const existing = inFlight.get(key);
    if (existing) return existing;
    if (inFlight.size >= maxNewsInFlightRequests) return Promise.reject(new Error(i18n.t("errors:tooManyRequestsInProgress")));
    const promise = start().finally(() => { inFlight.delete(key); });
    inFlight.set(key, promise);
    return promise;
  };
}
