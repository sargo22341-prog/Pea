import type { NewsFeedPage, User } from "@pea/shared";
import { api } from "../../../lib/api";
import { createInFlightRegistry, createNewsListeners, debugNews, trimMapByInsertion } from "./newsCache";

const maxCachedPages = 50;

export interface GlobalNewsSnapshot {
  feed: NewsFeedPage;
  loadedAt: number;
}

const entries = new Map<string, GlobalNewsSnapshot>();
const listeners = createNewsListeners();
const shareLoad = createInFlightRegistry();

export const subscribeGlobalNews = listeners.subscribe;

function pageKey(user: User, page: number) {
  return `global:${user.id}:${user.newsLanguages.join(",")}:page:${page}`;
}

export function globalNewsSnapshot(user: User, page: number): GlobalNewsSnapshot | null {
  return entries.get(pageKey(user, page)) ?? null;
}

function fetchPage(key: string, page: number) {
  debugNews("page globale", { endpoint: `/api/news-global?page=${page}` });
  return api.globalNews(page).then((feed) => {
    entries.set(key, { feed, loadedAt: Date.now() });
    trimMapByInsertion(entries, maxCachedPages);
    listeners.notify();
  });
}

/** Charge la page si elle n'est pas encore en cache. */
export function ensureGlobalNews(user: User, page: number): Promise<void> {
  const key = pageKey(user, page);
  if (entries.has(key)) return Promise.resolve();
  return shareLoad(key, () => fetchPage(key, page));
}

/** Recharge la page en arrière-plan ; l'ancienne reste affichée jusqu'à la réponse. */
export function revalidateGlobalNews(user: User, page: number): Promise<void> {
  const key = pageKey(user, page);
  return shareLoad(key, () => fetchPage(key, page));
}
