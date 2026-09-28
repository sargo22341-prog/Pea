import type { AssetValuation } from "@pea/shared";
import type { YahooSummaryRaw } from "../../yahoo.raw.js";
import { rawDate, rawNumber, rawString } from "../../utils/raw-values.js";

/** Nombre minimal d'indicateurs pour qu'un bloc de valorisation vaille la peine d'être envoyé. */
const VALUATION_MIN_FIELDS = 2;

/**
 * Valorisation d'une action. `defaultKeyStatistics` fournit les multiples de bilan, `summaryDetail`
 * les PER et P/S calculés sur le cours du jour et `price` la capitalisation la plus récente.
 * Les ETF n'ont pas de valorisation au sens de ce bloc.
 */
export function valuationFromSummary(summary: YahooSummaryRaw): AssetValuation | undefined {
  if (summary.fundProfile && Object.keys(summary.fundProfile).length) return undefined;
  const stats = summary.defaultKeyStatistics ?? {};
  const detail = summary.summaryDetail ?? {};
  const price = summary.price ?? {};
  const valuation: AssetValuation = {
    trailingPE: rawNumber(detail.trailingPE),
    forwardPE: rawNumber(stats.forwardPE) ?? rawNumber(detail.forwardPE),
    priceToBook: rawNumber(stats.priceToBook),
    priceToSales: rawNumber(detail.priceToSalesTrailing12Months),
    trailingEps: rawNumber(stats.trailingEps),
    forwardEps: rawNumber(stats.forwardEps),
    marketCap: rawNumber(price.marketCap) ?? rawNumber(detail.marketCap),
    enterpriseValue: rawNumber(stats.enterpriseValue),
    enterpriseToEbitda: rawNumber(stats.enterpriseToEbitda),
    beta: rawNumber(stats.beta) ?? rawNumber(detail.beta),
    floatShares: rawNumber(stats.floatShares),
    fiftyTwoWeekChange: rawNumber(stats["52WeekChange"]),
    indexFiftyTwoWeekChange: rawNumber(stats.SandP52WeekChange),
    lastSplitFactor: rawString(stats.lastSplitFactor),
    lastSplitDate: rawDate(stats.lastSplitDate),
    currency: rawString(price.currency) ?? rawString(detail.currency)
  };
  const numericFields = Object.values(valuation).filter((value) => typeof value === "number");
  return numericFields.length >= VALUATION_MIN_FIELDS ? valuation : undefined;
}
