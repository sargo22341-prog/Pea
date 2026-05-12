/**
 * Role du fichier : isoler le cache SQL des news Yahoo et sa regle de TTL.
 */

import type { NewsArticle } from "@pea/shared";
import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { db } from "../../../db.js";
import { nowSeconds } from "../utils/stale.js";

const newsCacheTtlSeconds = 6 * 60 * 60;

/** Lit un flux de news cache et force stale si les anciennes donnees n'ont pas de date. */
export function readNewsCache(cacheKey: string): MarketDataResult<NewsArticle[]> | null {
  const row = db.prepare("SELECT payload, fetched_at FROM cached_news WHERE symbol = ?").get(cacheKey) as
    | { payload: string; fetched_at: number }
    | undefined;

  if (!row) return null;
  const data = JSON.parse(String(row.payload)) as NewsArticle[];
  if (data.some((article) => !article.publishedAt)) return { data, stale: true };
  return { data, stale: nowSeconds() - Number(row.fetched_at) >= newsCacheTtlSeconds };
}

/** Ecrit un flux de news cache sous une cle symbolique. */
export function writeNewsCache(cacheKey: string, payload: NewsArticle[]) {
  db.prepare(
    `INSERT INTO cached_news (symbol, payload, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
  ).run(cacheKey, JSON.stringify(payload), nowSeconds());
}
