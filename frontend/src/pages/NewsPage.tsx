import type { User } from "@pea/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { NewsArticleList } from "../components/NewsArticleList";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";

const pageSize = 20;
const portfolioOnlyStorageKey = "pea.news.portfolioOnly";

export function NewsPage({ user }: { user: User }) {
  const [portfolioOnly, setPortfolioOnly] = useState(() => {
    const stored = window.localStorage.getItem(portfolioOnlyStorageKey);
    return stored === null ? true : stored === "true";
  });
  const [assetPage, setAssetPage] = useState(1);
  const [globalPage, setGlobalPage] = useState(1);
  const assetNews = useAsync((signal) => api.assetNews(signal), []);
  const globalNews = useAsync((signal) => api.globalNews(globalPage, signal), [globalPage]);

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

  function changePage(nextPage: number) {
    if (portfolioOnly) {
      setAssetPage(nextPage);
      return;
    }
    setGlobalPage(nextPage);
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
            onClick={() => {
              setPortfolioOnly((current) => {
                const next = !current;
                window.localStorage.setItem(portfolioOnlyStorageKey, String(next));
                return next;
              });
              setAssetPage(1);
              setGlobalPage(1);
            }}
            role="switch"
            type="button"
          >
            <span className={`h-4 w-4 rounded-full bg-white transition ${portfolioOnly ? "translate-x-5" : ""}`} />
          </button>
        </label>
      </div>

      {error && <div className="card border-coral p-4 text-coral">{error}</div>}
      {loading ? (
        <div className="card p-6 text-slate-400">Chargement des actualites...</div>
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
