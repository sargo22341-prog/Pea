/**
 * Role du fichier : recuperer les fundamentals Yahoo et produire marketInfo.
 */

import type { AssetMarketInfo } from "@pea/shared";
import { readCache, writeCache } from "../cache/yahoo.cache.js";
import { safeYahooCall, yahooClient } from "../yahoo.client.js";
import type { MarketDataResult } from "../../market-data-provider.js";
import { marketInfoFromSummary } from "./fundamentals.mapper.js";

const fundamentalsModules = [
  "assetProfile",
  "financialData",
  "fundProfile",
  "fundPerformance",
  "topHoldings",
  "summaryDetail",
  "price",
  "quoteType",
  "incomeStatementHistory"
];

/** Recupere le quoteSummary brut conserve par l'ancien service. */
export async function fetchFundamentals(symbol: string): Promise<MarketDataResult<any>> {
  const key = symbol.toUpperCase();
  const result = await safeYahooCall<any>(
    `fundamentals:${key}`,
    () => yahooClient.quoteSummary(key, { modules: fundamentalsModules } as any),
    () => readCache<any>("cached_fundamentals", key, 24 * 60 * 60),
    (data) => writeCache("cached_fundamentals", key, data)
  );

  return { data: result.data, stale: result.stale };
}

/** Produit l'objet marketInfo a partir des fundamentals caches ou frais. */
export async function fetchMarketInfo(symbol: string): Promise<MarketDataResult<AssetMarketInfo>> {
  const result = await fetchFundamentals(symbol);
  return { data: marketInfoFromSummary(result.data), stale: result.stale };
}
