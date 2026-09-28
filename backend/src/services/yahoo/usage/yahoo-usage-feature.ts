import type { YahooUsageFeature } from "@pea/shared";

/**
 * Famille fonctionnelle d'un appel Yahoo d'après sa clé de requête. Source de vérité unique pour
 * l'écriture du journal et la reprise des journaux existants.
 */
export function yahooUsageFeatureForKey(key: string): YahooUsageFeature {
  const [prefix = "", , qualifier = ""] = key.split(":");
  if (prefix === "fundamentals-timeseries") return qualifier.startsWith("quarterly") ? "quarterly-statements" : "annual-statements";
  if (prefix === "fundamentals") return "fundamentals";
  if (prefix === "insights") return "insights";
  if (prefix === "similar") return "similar-assets";
  if (prefix === "dividends" || (prefix === "chart" && key.endsWith(":div|split"))) return "dividends";
  if (prefix === "chart" || prefix === "history") return "charts";
  if (prefix === "news") return "news";
  if (prefix === "search") return "search";
  if (prefix === "screener" || prefix === "trendingSymbols" || key.startsWith("quote:trendingSymbols:")) return "screeners";
  if (prefix === "icon" || prefix === "asset-profile") return "asset-icons";
  if (prefix.startsWith("market-quote") || prefix === "quote" || prefix === "quoteBatch" || prefix === "quoteCombine" || prefix === "quote-summary") return "quotes";
  return "other";
}
