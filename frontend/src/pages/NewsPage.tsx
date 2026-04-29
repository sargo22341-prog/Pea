/**
 * Rôle du fichier : afficher les actualités avec un chargement différé selon le
 * mode sélectionné, puis précharger l'autre mode sans bloquer l'interface.
 */

import type { NewsArticle, NewsAssetsPage, NewsFeedPage, User } from "@pea/shared";
import { ChevronLeft, ChevronRight, Newspaper } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NewsArticleList } from "../components/NewsArticleList";
import { api } from "../lib/api";

type NewsMode = "assets" | "global";

interface AsyncNewsState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface AssetNewsCacheEntry {
  articles: NewsArticle[];
  loadedOffsets: Set<number>;
  totalAssets: number | null;
  fullyLoaded: boolean;
}

const pageSize = 20;
const assetNewsBatchSize = 8;
const portfolioOnlyStorageKey = "pea.news.portfolioOnly";
const assetNewsCache = new Map<string, AssetNewsCacheEntry>();
const globalNewsCache = new Map<string, NewsFeedPage>();
const assetNewsInFlight = new Map<string, Promise<NewsAssetsPage>>();
const assetNewsBackgroundInFlight = new Map<string, Promise<void>>();
const globalNewsInFlight = new Map<string, Promise<NewsFeedPage>>();

export function NewsPage({ user }: { user: User }) {
  const [portfolioOnly, setPortfolioOnly] = useState(() => readInitialPortfolioMode());
  const [assetPage, setAssetPage] = useState(1);
  const [globalPage, setGlobalPage] = useState(1);
  const [assetNews, setAssetNews] = useState<AsyncNewsState<NewsArticle[]>>(() => ({
    data: assetNewsCache.get(assetCacheKey(user))?.articles ?? null,
    loading: false,
    error: null
  }));
  const [globalNews, setGlobalNews] = useState<AsyncNewsState<NewsFeedPage>>(() => ({
    data: globalNewsCache.get(globalCacheKey(user, 1)) ?? null,
    loading: false,
    error: null
  }));

  const activeMode: NewsMode = portfolioOnly ? "assets" : "global";
  const userCachePart = user.newsLanguages.join(",");

  useEffect(() => {
    console.debug("[news] mode initial selectionne", { mode: activeMode });
    // Ce log ne doit s'exécuter qu'au premier montage pour vérifier le mode initial.
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
  const assetTotalPages = Math.ceil(assetArticles.length / pageSize);
  const safeAssetPage = Math.min(assetPage, assetTotalPages || 1);
  const pagedAssetArticles = useMemo(
    () => assetArticles.slice((safeAssetPage - 1) * pageSize, safeAssetPage * pageSize),
    [assetArticles, safeAssetPage]
  );

  const articles = portfolioOnly ? pagedAssetArticles : globalNews.data?.articles ?? [];
  const loading = portfolioOnly ? assetNews.loading : globalNews.loading;
  const error = portfolioOnly ? assetNews.error : globalNews.error;
  const currentPage = portfolioOnly ? safeAssetPage : globalNews.data?.page ?? globalPage;
  const totalPages = portfolioOnly ? assetTotalPages : globalNews.data?.totalPages ?? 0;

  /**
   * Change la page du mode actif sans toucher au cache de l'autre mode.
   *
   * @param nextPage Nouvelle page demandée.
   * @returns Rien.
   */
  function changePage(nextPage: number) {
    if (portfolioOnly) {
      setAssetPage(nextPage);
      return;
    }
    setGlobalPage(nextPage);
  }

  /**
   * Bascule entre actualités d'actifs et actualités globales.
   *
   * @returns Rien.
   */
  function toggleMode() {
    setPortfolioOnly((current) => {
      const next = !current;
      const nextMode: NewsMode = next ? "assets" : "global";
      window.localStorage.setItem(portfolioOnlyStorageKey, String(next));
      console.debug("[news] changement de mode", {
        mode: nextMode,
        cache: hasModeCache(user, nextMode, globalPage) ? "hit" : "miss"
      });
      return next;
    });
    setAssetPage(1);
    setGlobalPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-bold">Actualite</h1>
          <p className="muted">
            Articles Yahoo Finance en {user.newsLanguages.includes("fr") ? "francais" : ""}
            {user.newsLanguages.length === 2 ? " et " : ""}
            {user.newsLanguages.includes("en") ? "anglais" : ""}.
          </p>
        </div>
        <label className="flex items-center gap-3 rounded-md border border-line bg-ink p-3">
          <span className="text-sm font-medium">Mes actifs</span>
          <button
            aria-checked={portfolioOnly}
            className={`flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${portfolioOnly ? "bg-mint" : "bg-panel2"}`}
            onClick={toggleMode}
            role="switch"
            type="button"
          >
            <span className={`h-4 w-4 rounded-full bg-white transition ${portfolioOnly ? "translate-x-5" : ""}`} />
          </button>
        </label>
      </div>

      {error && <div className="card border-coral p-4 text-coral">{error}</div>}
      {loading ? (
        <NewsSkeleton title={portfolioOnly ? "Actualites de mes actifs" : "Actualites globales"} />
      ) : (
        <NewsArticleList
          articles={articles}
          emptyLabel={portfolioOnly ? "Aucun article lie a vos actifs pour le moment." : "Aucun article global pour le moment."}
          showRelatedAssets={portfolioOnly}
          title={portfolioOnly ? "Actualites de mes actifs" : "Actualites globales"}
        />
      )}

      {!loading && !error && totalPages > 1 && (
        <Pagination currentPage={currentPage} onChange={changePage} totalPages={totalPages} />
      )}
    </div>
  );
}

/**
 * Lit le mode initial stocké localement.
 *
 * @returns true si le mode "Mes actifs" doit être actif.
 */
function readInitialPortfolioMode() {
  const stored = window.localStorage.getItem(portfolioOnlyStorageKey);
  return stored === null ? true : stored === "true";
}

/**
 * Construit la clé de cache des actualités d'actifs selon les préférences utilisateur.
 *
 * @param user Utilisateur courant.
 * @returns Clé stable du cache local.
 */
function assetCacheKey(user: User) {
  return `assets:${user.id}:${user.newsLanguages.join(",")}`;
}

/**
 * Construit la clé de cache des actualités globales selon la page et les langues.
 *
 * @param user Utilisateur courant.
 * @param page Page globale demandée.
 * @returns Clé stable du cache local.
 */
function globalCacheKey(user: User, page: number) {
  return `global:${user.id}:${user.newsLanguages.join(",")}:page:${page}`;
}

/**
 * Indique si un mode possède déjà une entrée en cache.
 *
 * @param user Utilisateur courant.
 * @param mode Mode interrogé.
 * @param globalPage Page globale courante.
 * @returns true si le cache local peut afficher instantanément le mode.
 */
function hasModeCache(user: User, mode: NewsMode, globalPage: number) {
  return mode === "assets" ? assetNewsCache.get(assetCacheKey(user))?.loadedOffsets.has(0) === true : globalNewsCache.has(globalCacheKey(user, globalPage));
}

/**
 * Charge les actualités d'actifs pour le mode actif.
 *
 * @param user Utilisateur courant.
 * @param signal Signal d'annulation React.
 * @param setState Setter de l'état d'actualité actifs.
 * @param reason Raison loggable du chargement.
 * @returns Promesse résolue après mise à jour de l'état.
 */
async function loadAssetMode(
  user: User,
  signal: AbortSignal,
  setState: React.Dispatch<React.SetStateAction<AsyncNewsState<NewsArticle[]>>>,
  reason: string
) {
  const key = assetCacheKey(user);
  const cached = assetNewsCache.get(key);
  if (cached?.loadedOffsets.has(0)) {
    console.debug("[news] cache hit", { mode: "assets", endpoint: "/api/news-assets", reason });
    setState({ data: cached.articles, loading: false, error: null });
    void preloadRemainingAssetNews(user, signal, setState);
    return;
  }

  console.debug("[news] endpoint appele en premier ou switch cache miss", {
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
 * Charge les actualités globales pour le mode actif.
 *
 * @param user Utilisateur courant.
 * @param page Page globale demandée.
 * @param signal Signal d'annulation React.
 * @param setState Setter de l'état d'actualité globale.
 * @param reason Raison loggable du chargement.
 * @returns Promesse résolue après mise à jour de l'état.
 */
async function loadGlobalMode(
  user: User,
  page: number,
  signal: AbortSignal,
  setState: React.Dispatch<React.SetStateAction<AsyncNewsState<NewsFeedPage>>>,
  reason: string
) {
  const key = globalCacheKey(user, page);
  const cached = globalNewsCache.get(key);
  if (cached) {
    console.debug("[news] cache hit", { mode: "global", endpoint: `/api/news-global?page=${page}`, reason });
    setState({ data: cached, loading: false, error: null });
    return;
  }

  console.debug("[news] endpoint appele en premier ou switch cache miss", { mode: "global", endpoint: `/api/news-global?page=${page}`, reason });
  setState((current) => ({ ...current, loading: true, error: null }));
  try {
    const data = await fetchGlobalNews(user, page);
    if (!signal.aborted) setState({ data, loading: false, error: null });
  } catch (error) {
    if (!signal.aborted) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Actualites indisponibles" }));
  }
}

/**
 * Précharge les actualités globales après le chargement complet du mode actif.
 *
 * @param user Utilisateur courant.
 * @param page Page globale à préchauffer.
 * @returns Promesse ignorée par l'interface.
 */
async function preloadGlobalMode(user: User, page: number) {
  const key = globalCacheKey(user, page);
  if (globalNewsCache.has(key) || globalNewsInFlight.has(key)) return;
  console.debug("[news] prechargement", { mode: "global", endpoint: `/api/news-global?page=${page}` });
  await fetchGlobalNews(user, page).catch((error) => {
    console.debug("[news] prechargement echoue", { mode: "global", error: error instanceof Error ? error.message : String(error) });
  });
}

/**
 * Précharge les actualités d'actifs après le chargement complet du mode global.
 *
 * @param user Utilisateur courant.
 * @returns Promesse ignorée par l'interface.
 */
async function preloadAssetMode(user: User) {
  const key = assetCacheKey(user);
  if (assetNewsCache.get(key)?.loadedOffsets.has(0) || assetNewsInFlight.has(assetPageCacheKey(user, 0))) return;
  console.debug("[news] prechargement", { mode: "assets", endpoint: `/api/news-assets?limit=${assetNewsBatchSize}&offset=0` });
  await fetchAssetNewsPage(user, 0).then(() => preloadRemainingAssetNews(user)).catch((error) => {
    console.debug("[news] prechargement echoue", { mode: "assets", error: error instanceof Error ? error.message : String(error) });
  });
}

/**
 * Récupère une vague d'actualités d'actifs avec déduplication et cache local.
 *
 * @param user Utilisateur courant.
 * @param offset Décalage du lot d'actifs à charger.
 * @returns Articles fusionnés disponibles après cette vague.
 */
function fetchAssetNewsPage(user: User, offset: number) {
  const pageKey = assetPageCacheKey(user, offset);
  const entry = getAssetNewsCacheEntry(user);
  if (entry.loadedOffsets.has(offset)) return Promise.resolve(entry.articles);
  const existing = assetNewsInFlight.get(pageKey);
  if (existing) return existing.then(() => getAssetNewsCacheEntry(user).articles);

  // Le cache in-flight ne reçoit pas le signal React : un rendu annulé ne doit pas
  // contaminer la promesse partagée par le rendu suivant ou par le préchargement.
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
 * Précharge les lots restants d'actualités d'actifs après la première vague.
 *
 * @param user Utilisateur courant.
 * @param signal Signal d'annulation optionnel du rendu actif.
 * @param setState Setter optionnel pour enrichir la liste visible progressivement.
 * @returns Promesse ignorée par l'interface quand le préchargement tourne en fond.
 */
function preloadRemainingAssetNews(
  user: User,
  signal?: AbortSignal,
  setState?: React.Dispatch<React.SetStateAction<AsyncNewsState<NewsArticle[]>>>
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
      console.debug("[news] prechargement suite actifs", {
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

/**
 * Construit la clé d'un lot d'actualités d'actifs.
 *
 * @param user Utilisateur courant.
 * @param offset Décalage du lot.
 * @returns Clé de requête locale.
 */
function assetPageCacheKey(user: User, offset: number) {
  return `${assetCacheKey(user)}:limit:${assetNewsBatchSize}:offset:${offset}`;
}

/**
 * Retourne l'entrée de cache locale des actualités d'actifs.
 *
 * @param user Utilisateur courant.
 * @returns Entrée existante ou nouvel espace de cache.
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
 * Fusionne un lot backend dans le cache local en dédupliquant puis en triant par date.
 *
 * @param user Utilisateur courant.
 * @param page Lot d'actualités retourné par /api/news-assets.
 * @returns Entrée de cache mise à jour.
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
 * Calcule l'identité stable d'un article pour éviter les doublons entre vagues.
 *
 * @param article Article normalisé.
 * @returns URL prioritaire, puis titre et date si l'URL manque.
 */
function newsArticleIdentity(article: NewsArticle) {
  return article.url || `${article.title}:${article.publishedAt ?? ""}`;
}

/**
 * Fusionne deux occurrences du même article en conservant tous les actifs liés.
 *
 * @param existing Article déjà connu.
 * @param incoming Article du nouveau lot.
 * @returns Article fusionné.
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
 * Trie les actualités par date de publication décroissante.
 *
 * @param articles Articles à trier.
 * @returns Liste triée sans mutation de l'entrée.
 */
function sortNewsArticlesByDate(articles: NewsArticle[]) {
  return [...articles].sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });
}

/**
 * Récupère les actualités globales avec déduplication et cache local.
 *
 * @param user Utilisateur courant.
 * @param page Page globale demandée.
 * @returns Page d'actualités globales.
 */
function fetchGlobalNews(user: User, page: number) {
  const key = globalCacheKey(user, page);
  const cached = globalNewsCache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = globalNewsInFlight.get(key);
  if (existing) return existing;

  // Le cache in-flight reste indépendant des AbortSignal pour éviter d'afficher
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

/**
 * Affiche des placeholders d'articles pendant le chargement local du mode actif.
 *
 * @param props Titre de la section en cours de chargement.
 * @returns Carte skeleton sans spinner global.
 */
function NewsSkeleton({ title }: { title: string }) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line p-4">
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            className="grid min-h-[92px] grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-md border border-line bg-ink p-3 sm:grid-cols-[96px_minmax(0,1fr)]"
            key={index}
          >
            <div className="flex h-16 w-[72px] items-center justify-center rounded-md border border-line bg-panel2 text-slate-500 sm:h-20 sm:w-24">
              <Newspaper size={24} />
            </div>
            <div className="min-w-0 self-center space-y-2">
              <div className="h-4 w-11/12 animate-pulse rounded bg-panel2" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-panel2" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-panel2" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Affiche la pagination du mode actif.
 *
 * @param props Page courante, total et callback de changement.
 * @returns Contrôles de pagination.
 */
function Pagination({
  currentPage,
  onChange,
  totalPages
}: {
  currentPage: number;
  onChange: (page: number) => void;
  totalPages: number;
}) {
  return (
    <div className="flex items-center justify-end gap-3">
      <button className="btn-ghost" disabled={currentPage <= 1} onClick={() => onChange(currentPage - 1)} type="button">
        <ChevronLeft size={17} />
        Precedent
      </button>
      <span className="text-sm text-slate-400">
        Page {currentPage} / {totalPages}
      </span>
      <button className="btn-ghost" disabled={currentPage >= totalPages} onClick={() => onChange(currentPage + 1)} type="button">
        Suivant
        <ChevronRight size={17} />
      </button>
    </div>
  );
}
