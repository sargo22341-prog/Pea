import { retryTemporary } from "./yahoo.client.js";
import { dedupeInFlight } from "../shared/inFlightDeduper.js";
import { mapChartRows, mapQuote, mapSnapshotQuote, nullableNumber, nullableString, type YahooSnapshotPayload } from "./yahoo.mapper.js";
import type { HistoryPoint, Quote } from "@pea/shared";
import { rawRecord, yahooChart, yahooFundamentalsTimeSeries, yahooQuote, yahooQuoteBatch, yahooQuoteSummary, type YahooFinancialTimeSeriesRaw, type YahooQuoteRaw, type YahooSummaryRaw } from "./yahoo.raw.js";

function limited<T>(key: string, task: () => Promise<T>) {
  return dedupeInFlight(key, () => retryTemporary(key, task));
}

export interface YahooAssetProfilePayload {
  country: string | null;
  sector: string | null;
  industry: string | null;
  website: string | null;
  longBusinessSummary: string | null;
  fullTimeEmployees: number | null;
  marketCap: number | null;
  beta: number | null;
}

export class YahooApi {
  async quote(symbol: string): Promise<{ quote: Quote; snapshot: YahooSnapshotPayload; raw: YahooQuoteRaw }> {
    const key = symbol.toUpperCase();
    const raw = await limited(`market-quote:${key}`, () => yahooQuote(key));
    return { quote: mapQuote(raw, key), snapshot: mapSnapshotQuote(raw, key), raw };
  }

  async quoteBatch(symbols: string[]): Promise<Quote[]> {
    const keys = [...new Set(symbols.map((symbol) => symbol.toUpperCase()).filter(Boolean))];
    if (!keys.length) return [];
    const rows = await limited(`market-quote-batch:${keys.sort().join(",")}`, () => yahooQuoteBatch(keys));
    return rows.map((row) => mapQuote(row, String(row.symbol ?? ""))).filter((quote) => quote.symbol);
  }

  async quoteBatchRaw(symbols: string[]): Promise<{ quote: Quote; snapshot: YahooSnapshotPayload }[]> {
    const keys = [...new Set(symbols.map((symbol) => symbol.toUpperCase()).filter(Boolean))];
    if (!keys.length) return [];
    const rows = await limited(`market-quote-batch-raw:${keys.sort().join(",")}`, () => yahooQuoteBatch(keys));
    return rows
      .map((row) => ({ quote: mapQuote(row, String(row.symbol ?? "")), snapshot: mapSnapshotQuote(row, String(row.symbol ?? "")) }))
      .filter((r) => r.quote.symbol);
  }

  async quoteSummary(symbol: string): Promise<{ profile: YahooAssetProfilePayload; raw: YahooSummaryRaw }> {
    const key = symbol.toUpperCase();
    const raw = await limited(`quote-summary:${key}`, () => yahooQuoteSummary(key, ["summaryProfile", "assetProfile", "price", "summaryDetail"]));
    const profileSource = rawRecord(raw.summaryProfile ?? raw.assetProfile);
    const price = rawRecord(raw.price);
    const summaryDetail = rawRecord(raw.summaryDetail);
    return {
      raw,
      profile: {
        country: nullableString(profileSource.country),
        sector: nullableString(profileSource.sector),
        industry: nullableString(profileSource.industry),
        website: nullableString(profileSource.website),
        longBusinessSummary: nullableString(profileSource.longBusinessSummary),
        fullTimeEmployees: nullableNumber(profileSource.fullTimeEmployees),
        marketCap: nullableNumber(price.marketCap ?? summaryDetail.marketCap),
        beta: nullableNumber(summaryDetail.beta)
      }
    };
  }

  async assetProfile(symbol: string): Promise<{ website: string | null; raw: YahooSummaryRaw }> {
    const key = symbol.toUpperCase();
    const raw = await limited(`asset-profile:${key}`, () => yahooQuoteSummary(key, ["assetProfile"]));
    return {
      raw,
      website: nullableString(rawRecord(raw.assetProfile).website)
    };
  }

  async chart(symbol: string, options: { period1: Date; period2?: Date; interval: string; events?: "div|split" | "div" }): Promise<{ quotes: HistoryPoint[]; dividends: Array<{ date: string; amount: number }>; splits: unknown[] }> {
    const key = symbol.toUpperCase();
    const chart = await limited(`chart:${key}:${options.period1.toISOString()}:${options.period2?.toISOString() ?? "now"}:${options.interval}:${options.events ?? "history"}`, () =>
      yahooChart(key, options)
    );
    const dividends = Object.values(chart?.events?.dividends ?? {})
      .map((row) => ({ date: new Date(row.date ?? "").toISOString(), amount: Number(row.amount) }))
      .filter((row) => Number.isFinite(new Date(row.date).getTime()) && Number.isFinite(row.amount));
    return {
      quotes: mapChartRows(chart?.quotes ?? []),
      dividends,
      splits: Object.values(chart?.events?.splits ?? {})
    };
  }

  async fundamentalsTimeSeries(symbol: string): Promise<YahooFinancialTimeSeriesRaw> {
    const key = symbol.toUpperCase();
    const now = new Date();
    const period1 = new Date(now);
    period1.setFullYear(now.getFullYear() - 6);

    return limited(`fundamentals-timeseries:${key}:annual-financials`, () =>
      yahooFundamentalsTimeSeries(key, {
        period1,
        period2: now,
        module: "financials",
        type: "annual"
      })
    );
  }
}

export const yahooApi = new YahooApi();
