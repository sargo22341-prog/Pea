import type { NewsAssetsPage } from "@pea/shared";
import { db } from "../../db.js";
import { unifiedCacheRepository } from "../cache/unified-cache.repository.js";

export interface StoredAssetNewsMetadata {
  name?: string | undefined;
  assetType?: string | undefined;
  quoteType?: string | undefined;
}

/** Page agrégée de `/news-assets` mise en cache, sans les paramètres de pagination. */
export type AssetNewsAggregate = Omit<NewsAssetsPage, "limit" | "offset">;

export class AssetNewsRepository {
  readMetadata(symbol: string): StoredAssetNewsMetadata {
    const key = symbol.toUpperCase();
    const asset = db.prepare("SELECT name, quote_type, type_disp FROM assets WHERE symbol = ?").get(key) as { name?: string; quote_type?: string; type_disp?: string } | undefined;
    const cachedQuote = unifiedCacheRepository.read("quote", key);
    let quote: { name?: string; quoteType?: string } | undefined;
    if (cachedQuote?.payload) {
      try {
        quote = JSON.parse(cachedQuote.payload) as { name?: string; quoteType?: string };
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

  /** Lit une page agrégée de `/news-assets` tant qu'elle a moins de `ttlSeconds`. */
  readAggregateCache(cacheKey: string, ttlSeconds: number): AssetNewsAggregate | null {
    const row = unifiedCacheRepository.read("news", cacheKey);
    if (!row) return null;
    if (Math.floor(Date.now() / 1000) - row.fetched_at > ttlSeconds) return null;
    return JSON.parse(row.payload) as AssetNewsAggregate;
  }

  /** Écrit une page agrégée qui expire (en millisecondes, comme toute la table) après `ttlSeconds`. */
  writeAggregateCache(cacheKey: string, aggregate: AssetNewsAggregate, ttlSeconds: number) {
    const fetchedAt = Math.floor(Date.now() / 1000);
    unifiedCacheRepository.write({
      scope: "news",
      key: cacheKey,
      payload: aggregate,
      fetchedAt,
      expiresAt: (fetchedAt + ttlSeconds) * 1000
    });
  }
}

export const assetNewsRepository = new AssetNewsRepository();
