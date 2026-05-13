import type { NewsArticle } from "@pea/shared";
import { safeString } from "../../assets/peaEligibility.js";

function newsPublishedAt(item: any) {
  const value = item?.providerPublishTime ?? item?.publishTime ?? item?.publishedAt ?? item?.pubDate;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1000).toISOString();
  if (typeof value === "string") {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
  }
  return undefined;
}

function newsImageUrl(item: any) {
  const direct = safeString(item?.thumbnail?.originalUrl) || safeString(item?.thumbnail?.url) || safeString(item?.imageUrl);
  if (direct) return direct;

  const resolutions = Array.isArray(item?.thumbnail?.resolutions) ? item.thumbnail.resolutions : [];
  const image = resolutions.find((resolution: any) => safeString(resolution?.url)) ?? resolutions[0];
  return safeString(image?.url) || undefined;
}

function normalizeRelatedTickers(item: any) {
  const tickers = Array.isArray(item?.relatedTickers) ? item.relatedTickers : [];
  const normalized = tickers.map((ticker: unknown) => safeString(ticker).toUpperCase()).filter((ticker: string) => Boolean(ticker));
  return [...new Set<string>(normalized)];
}

function normalizeNewsArticle(item: any): NewsArticle | null {
  const title = safeString(item?.title);
  const url = safeString(item?.link) || safeString(item?.url);
  if (!title || !url) return null;

  const publisher = safeString(item?.publisher) || safeString(item?.provider);
  const publishedAt = newsPublishedAt(item);
  return {
    title,
    description: safeString(item?.summary) || safeString(item?.description),
    url,
    imageUrl: newsImageUrl(item),
    publisher: publisher || undefined,
    publishedAt,
    relatedTickers: normalizeRelatedTickers(item)
  };
}

/** Normalise et deduplique par URL les news brutes de Yahoo Search. */
export function normalizeNewsArticles(news: unknown): NewsArticle[] {
  if (!Array.isArray(news)) return [];

  const seen = new Set<string>();
  return news.reduce<NewsArticle[]>((articles, item) => {
    const article = normalizeNewsArticle(item);
    if (!article || seen.has(article.url)) return articles;
    seen.add(article.url);
    articles.push(article);
    return articles;
  }, []);
}

/** Recupere le nom propose par Yahoo dans les quotes d'une recherche news. */
export function searchQuoteName(result: any) {
  const quote = Array.isArray(result?.quotes) ? result.quotes[0] : undefined;
  return safeString(quote?.shortname) || safeString(quote?.longname) || safeString(quote?.name) || safeString(quote?.symbol);
}
