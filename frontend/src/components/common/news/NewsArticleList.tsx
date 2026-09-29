import type { NewsArticle } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { NewsArticleCard } from "./NewsArticleCard";

export function NewsArticleList({
  articles,
  emptyLabel,
  showRelatedAssets = false,
  title
}: {
  articles: NewsArticle[];
  emptyLabel?: string;
  showRelatedAssets?: boolean;
  title?: string;
}) {
  const { t } = useTranslation(["common"]);
  const resolvedTitle = title ?? t("news.articlesTitle", { ns: "common" });
  const resolvedEmptyLabel = emptyLabel ?? t("news.emptyAsset", { ns: "common" });

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line p-4">
        <h2 className="font-semibold">{resolvedTitle}</h2>
      </div>
      <div className="space-y-3 p-4">
        {articles.length === 0 && <p className="text-slate-400">{resolvedEmptyLabel}</p>}
        {articles.map((article) => (
          <NewsArticleCard article={article} key={article.url} showRelatedAssets={showRelatedAssets} />
        ))}
      </div>
    </section>
  );
}
