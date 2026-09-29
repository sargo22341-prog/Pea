import { useEffect } from "react";
import type { User } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { NewsArticleList } from "../../components/common/news/NewsArticleList";
import { NewsByAssetList } from "./components/NewsByAssetList";
import { NewsHeader } from "./components/NewsHeader";
import { NewsPagination } from "./components/NewsPagination";
import { NewsSkeleton } from "./components/NewsSkeleton";
import { useNewsPageData } from "./hooks/useNewsPageData";
import { useNewsView } from "./hooks/useNewsView";

export function NewsPage({ user }: { user: User }) {
  const { t } = useTranslation("navigation");
  const {
    articles,
    assetArticles,
    currentPage,
    error,
    loading,
    portfolioOnly,
    totalPages,
    changePage,
    toggleMode
  } = useNewsPageData(user);
  const { view, changeView } = useNewsView();
  const groupedByAsset = portfolioOnly && view === "byAsset";

  useEffect(() => {
    document.title = "News | PEA Portfolio";
    return () => {
      document.title = "PEA Portfolio";
    };
  }, []);

  const sectionTitle = portfolioOnly ? t("portfolioNews") : t("globalNews");
  const emptyLabel = portfolioOnly ? t("noPortfolioNews") : t("noGlobalNews");

  return (
    <div className="space-y-6">
      <NewsHeader onViewChange={changeView} portfolioOnly={portfolioOnly} toggleMode={toggleMode} user={user} view={view} />

      {error && <div className="card border-coral p-4 text-coral">{error}</div>}
      {loading ? (
        <NewsSkeleton title={sectionTitle} />
      ) : groupedByAsset ? (
        <NewsByAssetList articles={assetArticles} emptyLabel={emptyLabel} />
      ) : (
        <NewsArticleList
          articles={articles}
          emptyLabel={emptyLabel}
          showRelatedAssets={portfolioOnly}
          title={sectionTitle}
        />
      )}

      {!loading && !error && !groupedByAsset && totalPages > 1 && (
        <NewsPagination currentPage={currentPage} onChange={changePage} totalPages={totalPages} />
      )}
    </div>
  );
}
