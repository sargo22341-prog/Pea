/**
 * Role du fichier : orchestrer l'affichage de la page Actualite en deleguant
 * les donnees et les blocs UI aux modules specialises de components/news.
 */

import { useEffect } from "react";
import type { User } from "@pea/shared";
import { NewsArticleList } from "../components/common/NewsArticleList";
import { NewsHeader } from "../components/news/NewsHeader";
import { NewsPagination } from "../components/news/NewsPagination";
import { NewsSkeleton } from "../components/news/NewsSkeleton";
import { useNewsPageData } from "../components/news/useNewsPageData";

export function NewsPage({ user }: { user: User }) {
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

  const sectionTitle = portfolioOnly ? "Actualites de mes actifs" : "Actualites globales";

  return (
    <div className="space-y-6">
      <NewsHeader portfolioOnly={portfolioOnly} toggleMode={toggleMode} user={user} />

      {error && <div className="card border-coral p-4 text-coral">{error}</div>}
      {loading ? (
        <NewsSkeleton title={sectionTitle} />
      ) : (
        <NewsArticleList
          articles={articles}
          emptyLabel={portfolioOnly ? "Aucun article lie a vos actifs pour le moment." : "Aucun article global pour le moment."}
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
