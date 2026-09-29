import type { NewsArticle } from "@pea/shared";
import { isEarningsArticle } from "../../../components/common/news/earnings-article";

export const NEWS_VIEWS = ["chronological", "byAsset"] as const;
export type NewsView = (typeof NEWS_VIEWS)[number];

export interface NewsAssetGroup {
  symbol: string;
  name: string;
  articles: NewsArticle[];
  earningsCount: number;
}

function publishedTime(article: NewsArticle) {
  const time = article.publishedAt ? Date.parse(article.publishedAt) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

/**
 * Regroupe les articles par actif lié : un article lié à plusieurs actifs apparaît dans chaque
 * groupe. Dans un groupe, les articles d'un jour de publication de résultats de cet actif passent
 * en tête, puis l'ordre est antéchronologique. Les groupes suivent leur article le plus récent.
 */
export function groupNewsByAsset(articles: readonly NewsArticle[]): NewsAssetGroup[] {
  const groups = new Map<string, NewsAssetGroup>();
  for (const article of articles) {
    for (const asset of article.relatedAssets ?? []) {
      const key = asset.symbol.toUpperCase();
      const group = groups.get(key) ?? { symbol: asset.symbol, name: asset.name, articles: [], earningsCount: 0 };
      if (group.articles.some((known) => known.url === article.url)) continue;
      group.articles.push(article);
      groups.set(key, group);
    }
  }

  const sorted = [...groups.values()].map((group) => {
    const ordered = [...group.articles].sort((a, b) => {
      const earningsFirst = Number(isEarningsArticle(b, group.symbol)) - Number(isEarningsArticle(a, group.symbol));
      return earningsFirst || publishedTime(b) - publishedTime(a);
    });
    return { ...group, articles: ordered, earningsCount: ordered.filter((article) => isEarningsArticle(article, group.symbol)).length };
  });
  const latest = (group: NewsAssetGroup) => Math.max(...group.articles.map(publishedTime));
  return sorted.sort((a, b) => latest(b) - latest(a) || a.name.localeCompare(b.name));
}
