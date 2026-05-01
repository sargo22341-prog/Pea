/**
 * Role du fichier : extraire les informations de marche utiles depuis un
 * quoteSummary Yahoo brut.
 */

import type { AssetMarketInfo, FinancialYearItem } from "@pea/shared";
import { safeString } from "../../assets/peaEligibility.js";

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

function timeSeriesRows(raw: any): any[] {
  if (Array.isArray(raw)) return raw.flatMap((row) => timeSeriesRows(row));
  if (Array.isArray(raw?.timeseries?.result)) return raw.timeseries.result.flatMap((row: any) => expandTimeSeriesResult(row));
  if (Array.isArray(raw?.result)) return raw.result.flatMap((row: any) => expandTimeSeriesResult(row));
  if (raw && typeof raw === "object") return expandTimeSeriesResult(raw);
  return [];
}

function expandTimeSeriesResult(row: any): any[] {
  const metricKey = Object.keys(row ?? {}).find((key) => key.startsWith("annual") && Array.isArray(row[key]));
  if (!metricKey || !Array.isArray(row?.timestamp)) return [row];
  return row.timestamp.map((timestamp: unknown, index: number) => ({
    date: timestamp,
    [metricKey]: row[metricKey]?.[index]
  }));
}

function rowYear(row: any) {
  const date = row.asOfDate ?? row.endDate ?? row.period ?? row.date;
  const timestamp = typeof date === "number" && date < 10_000_000_000 ? date * 1000 : date;
  const year = date ? new Date(timestamp).getFullYear() : Number(row.fiscalYear);
  return Number.isInteger(year) ? year : undefined;
}

export function financialRowsFromTimeSeries(raw: any): FinancialYearItem[] {
  const byYear = new Map<number, { revenue?: number; netIncome?: number }>();

  for (const row of timeSeriesRows(raw)) {
    const year = rowYear(row);
    const revenue = rawNumber(row.annualTotalRevenue ?? row.totalRevenue);
    const netIncome = rawNumber(row.annualNetIncome ?? row.netIncome);
    if (!year || revenue === undefined || netIncome === undefined || revenue === 0) continue;
    byYear.set(year, { revenue, netIncome });
  }

  return [...byYear.entries()]
    .map(([year, row]) => ({
      year,
      revenue: row.revenue as number,
      netIncome: row.netIncome as number,
      netMargin: ((row.netIncome as number) / (row.revenue as number)) * 100
    }))
    .sort((a, b) => a.year - b.year)
    .slice(-5);
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
