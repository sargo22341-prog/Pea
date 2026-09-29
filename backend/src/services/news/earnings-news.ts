import { DAY_MS, calendarEventDay, type NewsArticle } from "@pea/shared";
import { readEarningsDatesForSymbols } from "../../repositories/calendar-events/calendar-events.repository.js";
import { EARNINGS_NEWS_WINDOW_DAYS, markEarningsArticles } from "./earnings-window.js";

/** Marge de lecture des évènements autour des articles, au-delà de la fenêtre (fuseaux). */
const EARNINGS_QUERY_MARGIN_DAYS = EARNINGS_NEWS_WINDOW_DAYS + 1;

/** Lit les publications de résultats des actifs liés aux articles puis les signale. */
export function annotateEarningsArticles(articles: NewsArticle[], timeZone: string): NewsArticle[] {
  const symbols = [...new Set(articles.flatMap((article) => (article.relatedAssets ?? []).map((asset) => asset.symbol.toUpperCase())))];
  const times = articles
    .map((article) => (article.publishedAt ? Date.parse(article.publishedAt) : Number.NaN))
    .filter(Number.isFinite);
  if (!symbols.length || !times.length) return articles;

  const margin = EARNINGS_QUERY_MARGIN_DAYS * DAY_MS;
  const fromIso = new Date(Math.min(...times) - margin).toISOString();
  const toIso = new Date(Math.max(...times) + margin).toISOString();
  const earningsDaysBySymbol = new Map<string, string[]>();
  for (const row of readEarningsDatesForSymbols(symbols, fromIso, toIso)) {
    const day = calendarEventDay(row.event_date, timeZone);
    if (!day) continue;
    const key = row.symbol.toUpperCase();
    earningsDaysBySymbol.set(key, [...(earningsDaysBySymbol.get(key) ?? []), day]);
  }
  return markEarningsArticles(articles, earningsDaysBySymbol, timeZone);
}
