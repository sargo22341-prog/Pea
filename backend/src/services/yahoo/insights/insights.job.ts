import type { AssetInsights } from "@pea/shared";
import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { featureFlagsService } from "../../admin/feature-flags.service.js";
import { INSIGHTS_FRESH_TTL_S, INSIGHTS_STALE_REJECT_S } from "../cache/cache.constants.js";
import { readCache, writeCache } from "../cache/yahoo.cache.js";
import { safeYahooCall } from "../yahoo.client.js";
import { yahooInsights, type YahooInsightsRaw } from "../yahoo.raw.js";
import { insightsFromResponse } from "./insights.mapper.js";

/** Signaux techniques d'un actif (cache d'une séance). 403 sans appel quand l'interrupteur est coupé. */
export async function fetchInsights(symbol: string): Promise<MarketDataResult<AssetInsights | null>> {
  featureFlagsService.assertEnabled("insights");
  const key = symbol.toUpperCase();
  const result = await safeYahooCall<YahooInsightsRaw>(
    `insights:${key}`,
    () => yahooInsights(key),
    () => readCache<YahooInsightsRaw>("cached_insights", key, INSIGHTS_FRESH_TTL_S, INSIGHTS_STALE_REJECT_S),
    (data) => { writeCache("cached_insights", key, data); }
  );
  return { data: insightsFromResponse(result.data) ?? null, stale: result.stale };
}
