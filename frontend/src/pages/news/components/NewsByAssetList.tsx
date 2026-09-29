import type { NewsArticle } from "@pea/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Collapsible } from "../../../components/common/feedback/Collapsible";
import { NewsArticleCard } from "../../../components/common/news/NewsArticleCard";
import { groupNewsByAsset } from "../lib/newsGrouping";

/** Articles regroupés par actif : un bloc repliable par actif, seul le premier est ouvert. */
export function NewsByAssetList({ articles, emptyLabel }: { articles: NewsArticle[]; emptyLabel: string }) {
  const { t } = useTranslation(["common"]);
  const groups = useMemo(() => groupNewsByAsset(articles), [articles]);

  if (!groups.length) {
    return <section className="card p-4 text-slate-400">{emptyLabel}</section>;
  }

  return (
    <div className="space-y-3">
      {groups.map((group, index) => {
        const count = t("news.articleCount", { count: group.articles.length, ns: "common" });
        const earnings = group.earningsCount ? ` · ${t("news.earningsCount", { count: group.earningsCount, ns: "common" })}` : "";
        return (
          <Collapsible defaultOpen={index === 0} key={group.symbol} title={`${group.name} · ${count}${earnings}`}>
            {group.articles.map((article) => (
              <NewsArticleCard article={article} earningsSymbol={group.symbol} key={article.url} showRelatedAssets={false} />
            ))}
          </Collapsible>
        );
      })}
    </div>
  );
}
