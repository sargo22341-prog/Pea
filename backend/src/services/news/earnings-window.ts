import type { NewsArticle } from "@pea/shared";
import { getZonedDateParts } from "../timezone/date-time.service.js";

/** Écart maximal, en jours civils, entre un article et une publication de résultats. */
export const EARNINGS_NEWS_WINDOW_DAYS = 1;

export const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndex(isoDay: string) {
  return Date.parse(`${isoDay}T00:00:00.000Z`) / DAY_MS;
}

function articleDay(article: NewsArticle, timeZone: string) {
  if (!article.publishedAt) return undefined;
  const date = new Date(article.publishedAt);
  return Number.isNaN(date.getTime()) ? undefined : getZonedDateParts(date, timeZone).isoDate;
}

/**
 * Renseigne `earningsSymbols` : parmi les actifs liés à un article, ceux dont une publication de
 * résultats tombe à `EARNINGS_NEWS_WINDOW_DAYS` jour(s) civil(s) près de sa date de publication.
 * Fonction pure : les jours de publication par symbole sont fournis par l'appelant.
 */
export function markEarningsArticles(
  articles: NewsArticle[],
  earningsDaysBySymbol: ReadonlyMap<string, readonly string[]>,
  timeZone: string
): NewsArticle[] {
  return articles.map((article) => {
    const day = articleDay(article, timeZone);
    if (!day) return article;
    const published = dayIndex(day);
    const earningsSymbols = (article.relatedAssets ?? [])
      .map((asset) => asset.symbol)
      .filter((symbol) => (earningsDaysBySymbol.get(symbol.toUpperCase()) ?? [])
        .some((earningsDay) => Math.abs(dayIndex(earningsDay) - published) <= EARNINGS_NEWS_WINDOW_DAYS));
    return earningsSymbols.length ? { ...article, earningsSymbols } : article;
  });
}
