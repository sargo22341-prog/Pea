import type { NewsArticle } from "@pea/shared";
import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { yahooCacheRepository } from "../../../repositories/yahoo/yahoo-cache.repository.js";
import { nowSeconds } from "../utils/stale.js";

const newsCacheTtlSeconds = 6 * 60 * 60;

/** Lit un flux de news cache et force stale si les anciennes donnees n'ont pas de date. */
export function readNewsCache(cacheKey: string): MarketDataResult<NewsArticle[]> | null {
  const row = yahooCacheRepository.readSymbol("cached_news", cacheKey);

  if (!row) return null;
  const data = JSON.parse(String(row.payload)) as NewsArticle[];
  if (data.some((article) => !article.publishedAt)) return { data, stale: true };
  return { data, stale: nowSeconds() - Number(row.fetched_at) >= newsCacheTtlSeconds };
}

/** Ecrit un flux de news cache sous une cle symbolique. */
export function writeNewsCache(cacheKey: string, payload: NewsArticle[]) {
  yahooCacheRepository.writeSymbol("cached_news", cacheKey, payload, nowSeconds());
}
