import type { NewsArticle, NewsLanguage } from "@pea/shared";
import { escapeRegExp, normalizeSearchText } from "../utils/text.js";

export function normalizeNewsLanguages(languages?: NewsLanguage[]): NewsLanguage[] {
  const normalized = [...new Set((languages ?? (["fr"] as NewsLanguage[])).filter((language): language is NewsLanguage => language === "fr" || language === "en"))];
  return normalized.length ? normalized : ["fr"];
}

export function newsOptions(language: NewsLanguage, newsCount = 20) {
  return {
    newsCount,
    quotesCount: 1,
    region: language === "fr" ? "FR" : "US",
    lang: language === "fr" ? "fr-FR" : "en-US",
    enableFuzzyQuery: false,
    enableEnhancedTrivialQuery: false,
    enableCb: false
  };
}

export function globalNewsOptions(language: NewsLanguage, newsCount = 20) {
  return {
    newsCount,
    quotesCount: 0,
    region: language === "fr" ? "FR" : "US",
    lang: language === "fr" ? "fr-FR" : "en-US",
    enableCb: false
  };
}

export function globalNewsQueries(language: NewsLanguage) {
  return language === "fr" ? ["bourse", "finance", "marches financiers"] : ["stock market", "finance", "economy"];
}

export function sortNewsByDateDesc(articles: NewsArticle[]) {
  return [...articles].sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });
}

export function dedupeNewsArticles(articles: NewsArticle[]) {
  const seen = new Set<string>();
  return articles.filter((article) => {
    const key = article.url || article.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function symbolBase(symbol: string) {
  return symbol.toUpperCase().split(".")[0] ?? symbol.toUpperCase();
}

function meaningfulCompanyKeywords(name: string) {
  const normalized = normalizeSearchText(name);
  return normalized
    .split(/[^a-z0-9]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4 && !["actions", "stock", "company", "groupe", "group", "societe", "sponsored", "ordinary"].includes(part));
}

function articleText(article: NewsArticle) {
  return normalizeSearchText(`${article.title} ${article.description}`);
}

function articleHasExactRelatedTicker(article: NewsArticle, symbol: string) {
  return article.relatedTickers?.some((ticker) => ticker.toUpperCase() === symbol.toUpperCase()) ?? false;
}

/** Garde uniquement les articles qui declarent explicitement le ticker demande. */
export function filterNewsByExactTicker(symbol: string, articles: NewsArticle[]) {
  return articles.filter((article) => articleHasExactRelatedTicker(article, symbol));
}

/** Fallback quand Yahoo ne lie pas le ticker : recherche le symbole court ou le nom d'entreprise dans le texte. */
export function filterNewsByFallbackKeywords(symbol: string, companyName: string, articles: NewsArticle[]) {
  const base = symbolBase(symbol);
  const keywords = new Set([normalizeSearchText(base), ...meaningfulCompanyKeywords(companyName)]);
  const strongKeywords = [...keywords].filter((keyword) => keyword.length >= 3);
  if (!strongKeywords.length) return [];

  return articles.filter((article) => {
    if (articleHasExactRelatedTicker(article, symbol)) return true;
    const text = articleText(article);
    return strongKeywords.some((keyword) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}([^a-z0-9]|$)`, "i").test(text));
  });
}
