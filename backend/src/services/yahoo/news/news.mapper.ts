import type { NewsArticle } from "@pea/shared";
import { safeString } from "../../assets/peaEligibility.js";
import { rawArray, rawRecord, type YahooNewsRaw, type YahooSearchRaw } from "../yahoo.raw.js";

function newsPublishedAt(item: YahooNewsRaw) {
  const value = item.providerPublishTime ?? item.publishTime ?? item.publishedAt ?? item.pubDate;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1000).toISOString();
  if (typeof value === "string") {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
  }
  return undefined;
}

/** Largeur visée pour une vignette affichée sur 96 px CSS en écran haute densité. */
const thumbnailTargetWidthPx = 192;
/** Au-delà, une résolution est jugée trop lourde pour une vignette. */
const thumbnailMaxWidthPx = 480;

/**
 * Choisit la plus petite résolution couvrant la cible sans être surdimensionnée ; à défaut la
 * plus grande résolution plus petite que la cible (souvent la 140x140 de Yahoo). L'original
 * n'est retenu que si aucune résolution de taille connue ne convient.
 */
function thumbnailResolutionUrl(item: YahooNewsRaw) {
  const resolutions = rawArray<unknown>(item.thumbnail?.resolutions).map(rawRecord)
    .map((resolution) => ({ url: safeString(resolution["url"]), width: Number(resolution["width"]) }))
    .filter((resolution) => resolution.url);
  const sized = resolutions.filter((resolution) => Number.isFinite(resolution.width) && resolution.width > 0);
  const fitting = sized.filter((resolution) => resolution.width >= thumbnailTargetWidthPx && resolution.width <= thumbnailMaxWidthPx);
  if (fitting.length) return fitting.reduce((best, resolution) => (resolution.width < best.width ? resolution : best)).url;
  const smaller = sized.filter((resolution) => resolution.width < thumbnailTargetWidthPx);
  if (smaller.length) return smaller.reduce((best, resolution) => (resolution.width > best.width ? resolution : best)).url;
  return resolutions[0]?.url;
}

function newsImageUrl(item: YahooNewsRaw) {
  const image = thumbnailResolutionUrl(item) || safeString(item.thumbnail?.originalUrl) || safeString(item.thumbnail?.url) || safeString(item.imageUrl);
  return normalizeExternalHttpsUrl(image);
}

export function normalizeExternalHttpsUrl(value: unknown) {
  const raw = safeString(value);
  if (!raw) return undefined;

  try {
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:" || !url.hostname) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeRelatedTickers(item: YahooNewsRaw) {
  const tickers = Array.isArray(item.relatedTickers) ? item.relatedTickers : [];
  const normalized = tickers.map((ticker: unknown) => safeString(ticker).toUpperCase()).filter((ticker: string) => Boolean(ticker));
  return [...new Set<string>(normalized)];
}

function normalizeNewsArticle(item: YahooNewsRaw): NewsArticle | null {
  const title = safeString(item.title);
  const url = normalizeExternalHttpsUrl(item.link) || normalizeExternalHttpsUrl(item.url);
  if (!title || !url) return null;

  const publisher = safeString(item.publisher) || safeString(item.provider);
  const publishedAt = newsPublishedAt(item);
  return {
    title,
    description: safeString(item.summary) || safeString(item.description),
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
    const article = normalizeNewsArticle(rawRecord(item));
    if (!article || seen.has(article.url)) return articles;
    seen.add(article.url);
    articles.push(article);
    return articles;
  }, []);
}

/** Recupere le nom propose par Yahoo dans les quotes d'une recherche news. */
export function searchQuoteName(result: YahooSearchRaw) {
  const quote = Array.isArray(result.quotes) ? result.quotes[0] : undefined;
  return safeString(quote?.shortname) || safeString(quote?.longname) || safeString(quote?.name) || safeString(quote?.symbol);
}
