import type { NewsArticle } from "@pea/shared";
import { db } from "../../db.js";
import { unifiedCacheRepository } from "../cache/unified-cache.repository.js";

export interface StoredAssetNewsMetadata {
  name?: string;
  assetType?: string;
  quoteType?: string;
}

export class AssetNewsRepository {
  readMetadata(symbol: string): StoredAssetNewsMetadata {
    const key = symbol.toUpperCase();
    const asset = db.prepare("SELECT name, quote_type, type_disp FROM assets WHERE symbol = ?").get(key) as { name?: string; quote_type?: string; type_disp?: string } | undefined;
    const cachedQuote = unifiedCacheRepository.read("quote", key);
    let quote: { name?: string; quoteType?: string } | undefined;
    if (cachedQuote?.payload) {
      try {
        quote = JSON.parse(String(cachedQuote.payload)) as { name?: string; quoteType?: string };
      } catch {
        quote = undefined;
      }
    }
    return {
      name: asset?.name ?? quote?.name,
      assetType: asset?.type_disp,
      quoteType: quote?.quoteType ?? asset?.quote_type
    };
  }

  readAggregateCache(cacheKey: string, ttlSeconds: number): NewsArticle[] | null {
    const row = unifiedCacheRepository.read("news", cacheKey);
    if (!row) return null;
    if (Math.floor(Date.now() / 1000) - Number(row.fetched_at) > ttlSeconds) return null;
    return JSON.parse(String(row.payload)) as NewsArticle[];
  }

  writeAggregateCache(cacheKey: string, articles: NewsArticle[]) {
    unifiedCacheRepository.write({
      scope: "news",
      key: cacheKey,
      payload: articles,
      fetchedAt: Math.floor(Date.now() / 1000)
    });
  }
}

export const assetNewsRepository = new AssetNewsRepository();
