/**
 * Role du fichier : transformer uniquement les champs reellement fournis par
 * yahoo-finance2 en objets internes nullables, sans inventer de donnees.
 */

import type { HistoryPoint, Quote } from "@pea/shared";

export function nullableNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function nullableDateIso(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1000).toISOString();
  if (typeof value === "string" && Number.isFinite(new Date(value).getTime())) return new Date(value).toISOString();
  return null;
}

export interface YahooSnapshotPayload {
  symbol: string;
  shortName: string | null;
  longName: string | null;
  quoteType: string | null;
  typeDisp: string | null;
  currency: string | null;
  exchange: string | null;
  fullExchangeName: string | null;
  market: string | null;
  marketState: string | null;
  regularMarketPrice: number | null;
  regularMarketChange: number | null;
  regularMarketChangePercent: number | null;
  regularMarketPreviousClose: number | null;
  regularMarketOpen: number | null;
  regularMarketDayHigh: number | null;
  regularMarketDayLow: number | null;
  regularMarketVolume: number | null;
  averageDailyVolume3Month: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
  trailingAnnualDividendRate: number | null;
  trailingAnnualDividendYield: number | null;
  regularMarketTime: string | null;
}

export function mapQuote(row: any, fallbackSymbol: string): Quote {
  const symbol = String(row?.symbol ?? fallbackSymbol).toUpperCase();
  const price = nullableNumber(row?.regularMarketPrice ?? row?.postMarketPrice ?? row?.preMarketPrice) ?? 0;
  return {
    symbol,
    name: row?.longName ?? row?.shortName ?? symbol,
    price,
    previousClose: nullableNumber(row?.regularMarketPreviousClose) ?? undefined,
    change: nullableNumber(row?.regularMarketChange) ?? undefined,
    changePercent: nullableNumber(row?.regularMarketChangePercent) ?? undefined,
    currency: row?.currency ?? "EUR",
    exchange: row?.fullExchangeName ?? row?.exchange,
    quoteType: row?.quoteType,
    marketState: row?.marketState,
    dividendRate: nullableNumber(row?.dividendRate ?? row?.trailingAnnualDividendRate) ?? undefined,
    dividendYield: nullableNumber(row?.dividendYield ?? row?.trailingAnnualDividendYield) ?? undefined
  };
}

export function mapSnapshotQuote(row: any, fallbackSymbol: string): YahooSnapshotPayload {
  return {
    symbol: String(row?.symbol ?? fallbackSymbol).toUpperCase(),
    shortName: nullableString(row?.shortName),
    longName: nullableString(row?.longName),
    quoteType: nullableString(row?.quoteType),
    typeDisp: nullableString(row?.typeDisp),
    currency: nullableString(row?.currency),
    exchange: nullableString(row?.exchange),
    fullExchangeName: nullableString(row?.fullExchangeName),
    market: nullableString(row?.market),
    marketState: nullableString(row?.marketState),
    regularMarketPrice: nullableNumber(row?.regularMarketPrice),
    regularMarketChange: nullableNumber(row?.regularMarketChange),
    regularMarketChangePercent: nullableNumber(row?.regularMarketChangePercent),
    regularMarketPreviousClose: nullableNumber(row?.regularMarketPreviousClose),
    regularMarketOpen: nullableNumber(row?.regularMarketOpen),
    regularMarketDayHigh: nullableNumber(row?.regularMarketDayHigh),
    regularMarketDayLow: nullableNumber(row?.regularMarketDayLow),
    regularMarketVolume: nullableNumber(row?.regularMarketVolume),
    averageDailyVolume3Month: nullableNumber(row?.averageDailyVolume3Month),
    dividendRate: nullableNumber(row?.dividendRate),
    dividendYield: nullableNumber(row?.dividendYield),
    trailingAnnualDividendRate: nullableNumber(row?.trailingAnnualDividendRate),
    trailingAnnualDividendYield: nullableNumber(row?.trailingAnnualDividendYield),
    regularMarketTime: nullableDateIso(row?.regularMarketTime)
  };
}

export function mapChartRows(rows: any[]): HistoryPoint[] {
  return rows
    .filter((row) => row?.date && Number.isFinite(Number(row.close)))
    .map((row) => ({
      date: new Date(row.date).toISOString(),
      open: nullableNumber(row.open) ?? undefined,
      high: nullableNumber(row.high) ?? undefined,
      low: nullableNumber(row.low) ?? undefined,
      close: Number(row.close),
      volume: nullableNumber(row.volume) ?? undefined
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
