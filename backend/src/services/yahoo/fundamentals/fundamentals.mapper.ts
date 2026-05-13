import type { AssetAnalystConsensus, AssetCalendarEventsData, AssetFundDetails, AssetMarketInfo, FinancialYearItem } from "@pea/shared";
import { safeString } from "../../assets/peaEligibility.js";
import { rawArray, rawRecord, type YahooFinancialTimeSeriesRaw, type YahooRawRecord, type YahooSummaryRaw } from "../yahoo.raw.js";
import { normalizeDividendYield } from "../yahoo.mapper.js";

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

function timeSeriesRows(raw: YahooFinancialTimeSeriesRaw | YahooRawRecord[] | unknown): YahooRawRecord[] {
  if (Array.isArray(raw)) return raw.flatMap((row) => timeSeriesRows(row));
  const record = rawRecord(raw);
  const timeseries = rawRecord(record.timeseries);
  if (Array.isArray(timeseries.result)) return rawArray<YahooRawRecord>(timeseries.result).flatMap((row) => expandTimeSeriesResult(row));
  if (Array.isArray(record.result)) return rawArray<YahooRawRecord>(record.result).flatMap((row) => expandTimeSeriesResult(row));
  if (raw && typeof raw === "object") return expandTimeSeriesResult(raw);
  return [];
}

function expandTimeSeriesResult(row: unknown): YahooRawRecord[] {
  const record = rawRecord(row);
  const metricKey = Object.keys(record).find((key) => key.startsWith("annual") && Array.isArray(record[key]));
  const timestamps = rawArray<unknown>(record.timestamp);
  if (!metricKey || !timestamps.length) return [record];
  const metricRows = rawArray<unknown>(record[metricKey]);
  return timestamps.map((timestamp: unknown, index: number) => ({
    date: timestamp,
    [metricKey]: metricRows[index]
  }));
}

function rowYear(row: YahooRawRecord) {
  const date = row.asOfDate ?? row.endDate ?? row.period ?? row.date;
  const timestamp = typeof date === "number" && date < 10_000_000_000 ? date * 1000 : date;
  const year = typeof timestamp === "string" || typeof timestamp === "number" || timestamp instanceof Date
    ? new Date(timestamp).getFullYear()
    : Number(row.fiscalYear);
  return Number.isInteger(year) ? year : undefined;
}

export function financialRowsFromTimeSeries(raw: YahooFinancialTimeSeriesRaw | YahooRawRecord[] | unknown): FinancialYearItem[] {
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

export function calendarEventsDataFromSummary(summary: YahooSummaryRaw): AssetCalendarEventsData | undefined {
  const cal = rawRecord(summary.calendarEvents);
  if (!Object.keys(cal).length) return undefined;
  const earnings = rawRecord(cal.earnings);
  const earningsDate = rawArray<unknown>(earnings.earningsDate);
  const earningsCallDate = rawArray<unknown>(earnings.earningsCallDate);
  const earningsDateRaw = earningsDate.length ? earningsDate[0] : earnings.earningsDate;
  const earningsCallDateRaw = earningsCallDate.length ? earningsCallDate[0] : earnings.earningsCallDate;
  return {
    earningsDate: rawDate(earningsDateRaw),
    earningsCallDate: rawDate(earningsCallDateRaw),
    isEarningsDateEstimate: Boolean(earnings.isEarningsDateEstimate),
    exDividendDate: rawDate(cal.exDividendDate),
    dividendDate: rawDate(cal.dividendDate)
  };
}

export function analystConsensusFromSummary(summary: YahooSummaryRaw): AssetAnalystConsensus | undefined {
  const fin = rawRecord(summary.financialData);
  if (!Object.keys(fin).length) return undefined;
  const numberOfAnalystOpinions = rawNumber(fin.numberOfAnalystOpinions);
  if (!numberOfAnalystOpinions) return undefined;
  return {
    currentPrice: rawNumber(fin.currentPrice),
    targetHighPrice: rawNumber(fin.targetHighPrice),
    targetLowPrice: rawNumber(fin.targetLowPrice),
    targetMeanPrice: rawNumber(fin.targetMeanPrice),
    targetMedianPrice: rawNumber(fin.targetMedianPrice),
    recommendationMean: rawNumber(fin.recommendationMean),
    recommendationKey: rawString(fin.recommendationKey),
    numberOfAnalystOpinions
  };
}

export function fundDetailsFromSummary(summary: YahooSummaryRaw): AssetFundDetails | undefined {
  const fp = rawRecord(summary.fundProfile);
  if (!Object.keys(fp).length) return undefined;
  const fees = rawRecord(fp.feesExpensesInvestment);
  const rawSectors = rawRecord(summary.topHoldings).sectorWeightings;
  const sectorWeightings: AssetFundDetails["sectorWeightings"] = Array.isArray(rawSectors)
    ? rawSectors.flatMap((obj) =>
        Object.entries(obj)
          .map(([key, v]) => ({ key, value: rawNumber(v) ?? 0 }))
          .filter(({ value }) => value > 0)
      )
    : undefined;
  return {
    family: rawString(fp.family),
    annualReportExpenseRatio: rawNumber(fees.annualReportExpenseRatio),
    annualHoldingsTurnover: rawNumber(fees.annualHoldingsTurnover),
    totalNetAssets: rawNumber(fees.totalNetAssets),
    sectorWeightings: sectorWeightings && sectorWeightings.length > 0 ? sectorWeightings : undefined
  };
}

/** Convertit quoteSummary en AssetMarketInfo consomme par l'API. */
export function marketInfoFromSummary(summary: YahooSummaryRaw): AssetMarketInfo {
  const price = rawRecord(summary.price);
  const detail = rawRecord(summary.summaryDetail);
  const calendarEvents = rawRecord(summary.calendarEvents);
  const fundProfile = rawRecord(summary.fundProfile);
  const fundPerformance = rawRecord(summary.fundPerformance);
  const range52 = rawRecord(detail.fiftyTwoWeekRange);
  return {
    marketState: rawString(price.marketState),
    regularMarketPrice: rawNumber(price.regularMarketPrice),
    regularMarketChange: rawNumber(price.regularMarketChange),
    regularMarketChangePercent: rawNumber(price.regularMarketChangePercent),
    regularMarketTime: rawDate(price.regularMarketTime),
    regularMarketPreviousClose: rawNumber(price.regularMarketPreviousClose) ?? rawNumber(detail.previousClose),
    regularMarketOpen: rawNumber(price.regularMarketOpen) ?? rawNumber(detail.open),
    regularMarketDayHigh: rawNumber(price.regularMarketDayHigh) ?? rawNumber(detail.dayHigh),
    regularMarketDayLow: rawNumber(price.regularMarketDayLow) ?? rawNumber(detail.dayLow),
    exchangeName: rawString(price.exchangeName) || rawString(price.exchange),
    currency: rawString(price.currency),
    regularMarketVolume: rawNumber(price.regularMarketVolume) ?? rawNumber(detail.volume),
    bid: rawNumber(price.bid),
    ask: rawNumber(price.ask),
    fiftyTwoWeekLow: rawNumber(detail.fiftyTwoWeekLow) ?? rawNumber(range52.low),
    fiftyTwoWeekHigh: rawNumber(detail.fiftyTwoWeekHigh) ?? rawNumber(range52.high),
    averageDailyVolume3Month: rawNumber(detail.averageDailyVolume3Month) ?? rawNumber(detail.averageVolume),
    totalAssets: rawNumber(detail.totalAssets) ?? rawNumber(fundProfile.totalAssets) ?? rawNumber(fundPerformance.totalAssets),
    dividendRate: rawNumber(detail.dividendRate) ?? rawNumber(price.trailingAnnualDividendRate),
    dividendYield: normalizeDividendYield(detail.dividendYield) ?? normalizeDividendYield(price.trailingAnnualDividendYield) ?? undefined,
    exDividendDate: rawDate(detail.exDividendDate) ?? rawDate(calendarEvents.exDividendDate)
  };
}
