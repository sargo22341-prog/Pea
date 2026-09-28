import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { featureFlagsService } from "../../admin/feature-flags.service.js";
import { RECOMMENDATIONS_FRESH_TTL_S, RECOMMENDATIONS_STALE_REJECT_S } from "../cache/cache.constants.js";
import { readCache, writeCache } from "../cache/yahoo.cache.js";
import { safeYahooCall } from "../yahoo.client.js";
import { rawArray, rawRecord, yahooRecommendationsBySymbol, type YahooRecommendationsRaw } from "../yahoo.raw.js";
import { rawNumber, rawString } from "../utils/raw-values.js";

/** Symboles proches d'un actif selon Yahoo, du plus pertinent au moins pertinent. */
export function similarSymbolsFromResponse(raw: unknown, symbol: string): string[] {
  const own = symbol.toUpperCase();
  const rows = rawArray<unknown>(rawRecord(raw)["recommendedSymbols"]).flatMap((entry) => {
    const row = rawRecord(entry);
    const recommended = rawString(row["symbol"])?.toUpperCase();
    return recommended && recommended !== own ? [{ symbol: recommended, score: rawNumber(row["score"]) ?? 0 }] : [];
  });
  return [...new Set(rows.sort((a, b) => b.score - a.score).map((row) => row.symbol))];
}

/** Symboles similaires (cache d'une semaine). 403 sans appel quand l'interrupteur est coupé. */
export async function fetchSimilarSymbols(symbol: string): Promise<MarketDataResult<string[]>> {
  featureFlagsService.assertEnabled("similar_assets");
  const key = symbol.toUpperCase();
  const result = await safeYahooCall<YahooRecommendationsRaw>(
    `similar:${key}`,
    () => yahooRecommendationsBySymbol(key),
    () => readCache<YahooRecommendationsRaw>("cached_recommendations", key, RECOMMENDATIONS_FRESH_TTL_S, RECOMMENDATIONS_STALE_REJECT_S),
    (data) => { writeCache("cached_recommendations", key, data); }
  );
  return { data: similarSymbolsFromResponse(result.data, key), stale: result.stale };
}
