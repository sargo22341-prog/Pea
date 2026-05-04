/**
 * Role du fichier : isoler les appels reseau yahoo-finance2 utilises comme
 * source de marche. Ce module ne gere aucun TTL et ne persiste rien.
 */

import { scheduleYahooCall, yahooClient } from "./yahoo.client.js";
import { dedupeInFlight } from "../shared/inFlightDeduper.js";
import { mapChartRows, mapQuote, mapSnapshotQuote, nullableNumber, nullableString, type YahooSnapshotPayload } from "./yahoo.mapper.js";
import type { HistoryPoint, Quote } from "@pea/shared";

function limited<T>(key: string, task: () => Promise<T>) {
  return dedupeInFlight(key, () => scheduleYahooCall(task));
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
  async quote(symbol: string): Promise<{ quote: Quote; snapshot: YahooSnapshotPayload; raw: any }> {
    const key = symbol.toUpperCase();
    const raw = await limited(`market-quote:${key}`, () => yahooClient.quote(key));
    return { quote: mapQuote(raw, key), snapshot: mapSnapshotQuote(raw, key), raw };
  }

  async quoteBatch(symbols: string[]): Promise<Quote[]> {
    const keys = [...new Set(symbols.map((symbol) => symbol.toUpperCase()).filter(Boolean))];
    if (!keys.length) return [];
    const rows = await limited(`market-quote-batch:${keys.sort().join(",")}`, () => yahooClient.quote(keys, { return: "array" } as any));
    return (rows as any[]).map((row) => mapQuote(row, String(row?.symbol ?? ""))).filter((quote) => quote.symbol);
  }

  async quoteBatchRaw(symbols: string[]): Promise<{ quote: Quote; snapshot: YahooSnapshotPayload }[]> {
    const keys = [...new Set(symbols.map((symbol) => symbol.toUpperCase()).filter(Boolean))];
    if (!keys.length) return [];
    const rows = await limited(`market-quote-batch-raw:${keys.sort().join(",")}`, () => yahooClient.quote(keys, { return: "array" } as any));
    return (rows as any[])
      .map((row) => ({ quote: mapQuote(row, String(row?.symbol ?? "")), snapshot: mapSnapshotQuote(row, String(row?.symbol ?? "")) }))
      .filter((r) => r.quote.symbol);
  }

  async quoteSummary(symbol: string): Promise<{ profile: YahooAssetProfilePayload; raw: any }> {
    const key = symbol.toUpperCase();
    const raw = await limited(`quote-summary:${key}`, () =>
      yahooClient.quoteSummary(key, { modules: ["summaryProfile", "assetProfile", "price", "summaryDetail"] } as any)
    );
    const profileSource = (raw as any)?.summaryProfile ?? (raw as any)?.assetProfile ?? {};
    const price = (raw as any)?.price ?? {};
    const summaryDetail = (raw as any)?.summaryDetail ?? {};
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

  async chart(symbol: string, options: { period1: Date; period2?: Date; interval: string; events?: "div|split" | "div" }): Promise<{ quotes: HistoryPoint[]; dividends: Array<{ date: string; amount: number }>; splits: unknown[] }> {
    const key = symbol.toUpperCase();
    const chart = (await limited(`chart:${key}:${options.period1.toISOString()}:${options.period2?.toISOString() ?? "now"}:${options.interval}:${options.events ?? "history"}`, () =>
      yahooClient.chart(key, { ...options, return: "array" } as any)
    )) as any;
    const dividends = Object.values(chart?.events?.dividends ?? {})
      .map((row: any) => ({ date: new Date(row.date).toISOString(), amount: Number(row.amount) }))
      .filter((row) => Number.isFinite(new Date(row.date).getTime()) && Number.isFinite(row.amount));
    return {
      quotes: mapChartRows(chart?.quotes ?? []),
      dividends,
      splits: Object.values(chart?.events?.splits ?? {})
    };
  }

  async fundamentalsTimeSeries(symbol: string): Promise<any> {
    const key = symbol.toUpperCase();
    const now = new Date();
    const period1 = new Date(now);
    period1.setFullYear(now.getFullYear() - 6);

    return limited(`fundamentals-timeseries:${key}:annual-financials`, () =>
      (yahooClient as any).fundamentalsTimeSeries(key, {
        period1,
        period2: now,
        module: "financials",
        type: "annual"
      })
    );
  }
}

export const yahooApi = new YahooApi();
