import type { SimilarAsset } from "@pea/shared";
import { marketDataGateway } from "../market/data/market-data-gateway.service.js";
import { fetchSimilarSymbols } from "../yahoo/recommendations/similar.job.js";
import { evaluatePeaEligibility } from "./peaEligibility.js";

/** Nombre d'actifs similaires proposés sur la fiche. */
export const SIMILAR_ASSETS_LIMIT = 6;
const PEA_ELIGIBLE_STATUSES = new Set(["eligible", "likely_eligible"]);

/**
 * Actifs proches d'un symbole, avec cours et éligibilité PEA. Les symboles que Yahoo ne sait
 * pas coter sont écartés ; les cours passent par le lot de cotations mis en cache.
 */
export async function similarAssets(symbol: string): Promise<SimilarAsset[]> {
  const symbols = (await fetchSimilarSymbols(symbol)).data;
  if (!symbols.length) return [];
  const quotes = (await marketDataGateway.readQuoteBatchWithCache(symbols)).data;
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote]));
  return symbols.flatMap((candidate): SimilarAsset[] => {
    const quote = bySymbol.get(candidate);
    if (!quote || quote.unavailable) return [];
    const eligibility = evaluatePeaEligibility({ ...quote, quoteType: quote.quoteType ?? "" });
    return [{
      symbol: quote.symbol.toUpperCase(),
      name: quote.name || quote.symbol,
      price: Number.isFinite(quote.price) && quote.price > 0 ? quote.price : undefined,
      currency: quote.currency,
      changePercent: quote.changePercent,
      peaEligible: PEA_ELIGIBLE_STATUSES.has(eligibility.status)
    }];
  }).slice(0, SIMILAR_ASSETS_LIMIT);
}
