/**
 * Role du fichier : extraire les informations de marche utiles depuis un
 * quoteSummary Yahoo brut.
 */

import type { AssetMarketInfo } from "@pea/shared";
import { safeString } from "../../peaEligibility.js";

function rawNumber(value: unknown): number | undefined {
  const candidate = value && typeof value === "object" && "raw" in value ? (value as { raw?: unknown }).raw : value;
  const numberValue = Number(candidate);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function rawString(value: unknown): string | undefined {
  const candidate = value && typeof value === "object" && "fmt" in value ? (value as { fmt?: unknown }).fmt : value;
  return safeString(candidate);
}

function rawDate(value: unknown): string | undefined {
  const candidate = value && typeof value === "object" && "raw" in value ? (value as { raw?: unknown }).raw : value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof candidate === "number" && Number.isFinite(candidate)) return new Date(candidate * 1000).toISOString();
  if (typeof candidate === "string") {
    const time = new Date(candidate).getTime();
    return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
  }
  return undefined;
}

/** Convertit quoteSummary en AssetMarketInfo consomme par l'API. */
export function marketInfoFromSummary(summary: any): AssetMarketInfo {
  const price = summary?.price ?? {};
  const detail = summary?.summaryDetail ?? {};
  const fundProfile = summary?.fundProfile ?? {};
  const fundPerformance = summary?.fundPerformance ?? {};
  return {
    marketState: rawString(price.marketState),
    regularMarketPrice: rawNumber(price.regularMarketPrice),
    regularMarketChange: rawNumber(price.regularMarketChange),
    regularMarketChangePercent: rawNumber(price.regularMarketChangePercent),
    exchangeName: rawString(price.exchangeName) || rawString(price.exchange),
    currency: rawString(price.currency),
    regularMarketVolume: rawNumber(price.regularMarketVolume) ?? rawNumber(detail.volume),
    fiftyTwoWeekLow: rawNumber(detail.fiftyTwoWeekLow),
    fiftyTwoWeekHigh: rawNumber(detail.fiftyTwoWeekHigh),
    averageDailyVolume3Month: rawNumber(detail.averageDailyVolume3Month) ?? rawNumber(detail.averageVolume),
    totalAssets: rawNumber(detail.totalAssets) ?? rawNumber(fundProfile.totalAssets) ?? rawNumber(fundPerformance.totalAssets),
    dividendRate: rawNumber(detail.dividendRate) ?? rawNumber(price.trailingAnnualDividendRate),
    dividendYield: rawNumber(detail.dividendYield) ?? rawNumber(price.trailingAnnualDividendYield),
    exDividendDate: rawDate(detail.exDividendDate)
  };
}
