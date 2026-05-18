import { useEffect } from "react";
import type { User } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { NewsArticleList } from "../../components/common/NewsArticleList";
import { NewsHeader } from "./components/NewsHeader";
import { NewsPagination } from "./components/NewsPagination";
import { NewsSkeleton } from "./components/NewsSkeleton";
import { useNewsPageData } from "./hooks/useNewsPageData";

export function NewsPage({ user }: { user: User }) {
  const { t } = useTranslation("navigation");
  const {
    articles,
    currentPage,
    error,
    loading,
    portfolioOnly,
    totalPages,
    changePage,
    toggleMode
  } = useNewsPageData(user);

  useEffect(() => {
    document.title = "News | PEA Portfolio";
    return () => {
      document.title = "PEA Portfolio";
    };
  }, []);

  const sectionTitle = portfolioOnly ? t("portfolioNews") : t("globalNews");

  return (
    <div className="space-y-6">
      <NewsHeader portfolioOnly={portfolioOnly} toggleMode={toggleMode} user={user} />

      {error && <div className="card border-coral p-4 text-coral">{error}</div>}
      {loading ? (
        <NewsSkeleton title={sectionTitle} />
      ) : (
        <NewsArticleList
          articles={articles}
          emptyLabel={portfolioOnly ? t("noPortfolioNews") : t("noGlobalNews")}
          showRelatedAssets={portfolioOnly}
          title={sectionTitle}
        />
      )}

      {!loading && !error && totalPages > 1 && (
        <NewsPagination currentPage={currentPage} onChange={changePage} totalPages={totalPages} />
      )}
    </div>
  );
}
