import { rateFinancialHealth, type AssetFinancialHealth, type AssetFinancialHealthMetrics } from "@pea/shared";
import type { YahooSummaryRaw } from "../../yahoo.raw.js";
import { rawNonZeroNumber, rawNumber, rawString } from "../../utils/raw-values.js";

/** Libellé Yahoo du secteur des banques, assurances et sociétés financières. */
const FINANCIAL_SECTOR = "Financial Services";

/**
 * Santé financière d'une action à partir de `financialData`.
 * Yahoo remplit de zéros les marges qu'il ne sait pas calculer (banques, sociétés sans chiffre
 * d'affaires) : un zéro exact y est traité comme une donnée absente.
 */
export function financialHealthFromSummary(summary: YahooSummaryRaw): AssetFinancialHealth | undefined {
  const data = summary.financialData;
  if (!data) return undefined;
  const isFinancialSector = rawString(summary.assetProfile?.sector) === FINANCIAL_SECTOR;
  const metrics: AssetFinancialHealthMetrics = {
    grossMargin: rawNonZeroNumber(data.grossMargins),
    operatingMargin: rawNonZeroNumber(data.operatingMargins),
    profitMargin: rawNonZeroNumber(data.profitMargins),
    returnOnEquity: rawNumber(data.returnOnEquity),
    returnOnAssets: rawNumber(data.returnOnAssets),
    debtToEquity: isFinancialSector ? undefined : rawNumber(data.debtToEquity),
    currentRatio: isFinancialSector ? undefined : rawNumber(data.currentRatio),
    quickRatio: isFinancialSector ? undefined : rawNumber(data.quickRatio),
    totalCash: rawNumber(data.totalCash),
    totalDebt: rawNumber(data.totalDebt),
    freeCashflow: rawNumber(data.freeCashflow),
    operatingCashflow: rawNumber(data.operatingCashflow),
    revenueGrowth: rawNumber(data.revenueGrowth),
    earningsGrowth: rawNumber(data.earningsGrowth)
  };
  if (Object.values(metrics).every((value) => value === undefined)) return undefined;
  return {
    metrics,
    isFinancialSector,
    currency: rawString(data.financialCurrency),
    verdict: rateFinancialHealth(metrics, isFinancialSector)
  };
}
