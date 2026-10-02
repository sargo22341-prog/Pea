import type { User } from "@pea/shared";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useMarketEventReload } from "../../../hooks/useMarketEventReload";
import { i18n } from "../../../i18n";
import { readBooleanPreference, writeLocalPreference } from "../../../lib/local-preference";
import { assetNewsSnapshot, ensureAssetNews, revalidateAssetNews, subscribeAssetNews } from "../lib/assetNewsStore";
import { ensureGlobalNews, globalNewsSnapshot, revalidateGlobalNews, subscribeGlobalNews } from "../lib/globalNewsStore";
import { debugNews, isOlderThan, newsCacheTtlMs, newsForegroundRevalidateMs } from "../lib/newsCache";
import type { NewsMode } from "../lib/newsTypes";
import { useBufferedNewsFeed } from "./useBufferedNewsFeed";

const PORTFOLIO_ONLY_KEY = "news.portfolioOnly";
export const newsPageSize = 20;

function errorText(error: unknown) {
  return error instanceof Error ? error.message : i18n.t("errors:newsUnavailable");
}

function logBackgroundFailure(action: string) {
  return (error: unknown) => { debugNews(`${action} echoue`, { error: errorText(error) }); };
}

export function useNewsPageData(user: User) {
  const [portfolioOnly, setPortfolioOnly] = useState(() => readBooleanPreference(PORTFOLIO_ONLY_KEY) ?? true);
  const [assetPage, setAssetPage] = useState(1);
  const [globalPage, setGlobalPage] = useState(1);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  const activeMode: NewsMode = portfolioOnly ? "assets" : "global";
  const userKey = `${user.id}:${user.newsLanguages.join(",")}`;
  const activeKey = activeMode === "assets" ? `assets:${userKey}` : `global:${userKey}:${globalPage}`;

  const assetLatest = useSyncExternalStore(subscribeAssetNews, () => assetNewsSnapshot(user));
  const globalLatest = useSyncExternalStore(subscribeGlobalNews, () => globalNewsSnapshot(user, globalPage));
  const assets = useBufferedNewsFeed(`assets:${userKey}`, assetLatest, (snapshot) => snapshot.articles);
  const global = useBufferedNewsFeed(`global:${userKey}:${globalPage}`, globalLatest, (snapshot) => snapshot.feed.articles);

  /** Recharge en arrière-plan le mode affiché si ses données ont au moins `minAgeMs`. */
  const revalidateActive = useCallback((minAgeMs: number) => {
    const snapshot = activeMode === "assets" ? assetNewsSnapshot(user) : globalNewsSnapshot(user, globalPage);
    if (!snapshot || !isOlderThan(snapshot.loadedAt, minAgeMs)) return Promise.resolve();
    debugNews("revalidation", { mode: activeMode, ageMs: Date.now() - snapshot.loadedAt });
    const revalidation = activeMode === "assets" ? revalidateAssetNews(user) : revalidateGlobalNews(user, globalPage);
    return revalidation.catch(logBackgroundFailure("revalidation"));
  }, [activeMode, globalPage, user]);

  // Charge le mode affiché, puis précharge l'autre ; un cache périmé est rechargé en arrière-plan.
  useEffect(() => {
    let active = true;
    const load = activeMode === "assets" ? ensureAssetNews(user) : ensureGlobalNews(user, globalPage);
    const preloadOther = () => (activeMode === "assets" ? ensureGlobalNews(user, 1) : ensureAssetNews(user));
    load.then(
      () => {
        if (active) setFailure(null);
        void revalidateActive(newsCacheTtlMs);
        preloadOther().catch(logBackgroundFailure("prechargement"));
      },
      (error: unknown) => {
        if (active) setFailure({ key: activeKey, message: errorText(error) });
      }
    );
    return () => { active = false; };
  }, [activeKey, activeMode, globalPage, revalidateActive, user]);

  useMarketEventReload({
    intervalMs: newsCacheTtlMs,
    reload: () => revalidateActive(newsForegroundRevalidateMs)
  });

  const assetArticles = useMemo(() => assets.shown?.articles ?? [], [assets.shown]);
  const assetTotalPages = Math.ceil(assetArticles.length / newsPageSize);
  const safeAssetPage = Math.min(assetPage, assetTotalPages || 1);
  const pagedAssetArticles = useMemo(
    () => assetArticles.slice((safeAssetPage - 1) * newsPageSize, safeAssetPage * newsPageSize),
    [assetArticles, safeAssetPage]
  );

  const activeFeed = portfolioOnly ? assets : global;
  const error = failure?.key === activeKey && !activeFeed.shown ? failure.message : null;

  function changePage(nextPage: number) {
    if (portfolioOnly) {
      setAssetPage(nextPage);
      return;
    }
    setGlobalPage(nextPage);
  }

  function toggleMode() {
    const next = !portfolioOnly;
    writeLocalPreference(PORTFOLIO_ONLY_KEY, String(next));
    debugNews("changement de mode", { mode: next ? "assets" : "global" });
    setPortfolioOnly(next);
    setAssetPage(1);
    setGlobalPage(1);
  }

  return {
    articles: portfolioOnly ? pagedAssetArticles : global.shown?.feed.articles ?? [],
    assetArticles,
    currentPage: portfolioOnly ? safeAssetPage : global.shown?.feed.page ?? globalPage,
    error,
    loading: !activeFeed.shown && !error,
    newArticlesCount: activeFeed.newCount,
    portfolioOnly,
    totalPages: portfolioOnly ? assetTotalPages : global.shown?.feed.totalPages ?? 0,
    changePage,
    showNewArticles: activeFeed.showLatest,
    toggleMode
  };
}
