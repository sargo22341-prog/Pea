/**
 * Role du fichier : regrouper l'etat, la pagination et les effets de chargement
 * de NewsPage pour laisser la page declarative.
 */

import type { NewsArticle, NewsFeedPage, User } from "@pea/shared";
import { useEffect, useMemo, useState } from "react";
import {
  debugNews,
  getCachedAssetArticles,
  getCachedGlobalNews,
  hasModeCache,
  loadAssetMode,
  loadGlobalMode,
  newsPageSize,
  portfolioOnlyStorageKey,
  preloadAssetMode,
  preloadGlobalMode,
  preloadRemainingAssetNews,
  readInitialPortfolioMode
} from "./newsData";
import type { AsyncNewsState, NewsMode } from "./newsTypes";

export function useNewsPageData(user: User) {
  const [portfolioOnly, setPortfolioOnly] = useState(() => readInitialPortfolioMode());
  const [assetPage, setAssetPage] = useState(1);
  const [globalPage, setGlobalPage] = useState(1);
  const [assetNews, setAssetNews] = useState<AsyncNewsState<NewsArticle[]>>(() => ({
    data: getCachedAssetArticles(user),
    loading: false,
    error: null
  }));
  const [globalNews, setGlobalNews] = useState<AsyncNewsState<NewsFeedPage>>(() => ({
    data: getCachedGlobalNews(user, 1),
    loading: false,
    error: null
  }));

  const activeMode: NewsMode = portfolioOnly ? "assets" : "global";
  const userCachePart = user.newsLanguages.join(",");

  useEffect(() => {
    debugNews("mode initial selectionne", { mode: activeMode });
    // Ce log ne doit s'executer qu'au premier montage pour verifier le mode initial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (activeMode === "assets") {
      void loadAssetMode(user, controller.signal, setAssetNews, "initial-or-switch");
    } else {
      void loadGlobalMode(user, globalPage, controller.signal, setGlobalNews, "initial-or-switch");
    }
    return () => controller.abort();
  }, [activeMode, globalPage, user, userCachePart]);

  useEffect(() => {
    if (activeMode === "assets" && assetNews.data && !assetNews.loading && !assetNews.error) {
      void preloadRemainingAssetNews(user, undefined, setAssetNews);
      void preloadGlobalMode(user, globalPage);
    }
    if (activeMode === "global" && globalNews.data && !globalNews.loading && !globalNews.error) {
      void preloadAssetMode(user);
    }
  }, [activeMode, assetNews.data, assetNews.error, assetNews.loading, globalNews.data, globalNews.error, globalNews.loading, globalPage, user]);

  const assetArticles = useMemo(() => assetNews.data ?? [], [assetNews.data]);
  const assetTotalPages = Math.ceil(assetArticles.length / newsPageSize);
  const safeAssetPage = Math.min(assetPage, assetTotalPages || 1);
  const pagedAssetArticles = useMemo(
    () => assetArticles.slice((safeAssetPage - 1) * newsPageSize, safeAssetPage * newsPageSize),
    [assetArticles, safeAssetPage]
  );

  const articles = portfolioOnly ? pagedAssetArticles : globalNews.data?.articles ?? [];
  const loading = portfolioOnly ? assetNews.loading : globalNews.loading;
  const error = portfolioOnly ? assetNews.error : globalNews.error;
  const currentPage = portfolioOnly ? safeAssetPage : globalNews.data?.page ?? globalPage;
  const totalPages = portfolioOnly ? assetTotalPages : globalNews.data?.totalPages ?? 0;

  /**
   * Change la page du mode actif sans toucher au cache de l'autre mode.
   */
  function changePage(nextPage: number) {
    if (portfolioOnly) {
      setAssetPage(nextPage);
      return;
    }
    setGlobalPage(nextPage);
  }

  /**
   * Bascule entre actualites d'actifs et actualites globales.
   */
  function toggleMode() {
    setPortfolioOnly((current) => {
      const next = !current;
      const nextMode: NewsMode = next ? "assets" : "global";
      window.localStorage.setItem(portfolioOnlyStorageKey, String(next));
      debugNews("changement de mode", {
        mode: nextMode,
        cache: hasModeCache(user, nextMode, globalPage) ? "hit" : "miss"
      });
      return next;
    });
    setAssetPage(1);
    setGlobalPage(1);
  }

  return {
    articles,
    currentPage,
    error,
    loading,
    portfolioOnly,
    totalPages,
    changePage,
    toggleMode
  };
}
