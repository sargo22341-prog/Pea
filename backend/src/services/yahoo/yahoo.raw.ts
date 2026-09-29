import type { ChartEventSplit } from "yahoo-finance2/modules/chart";
import type { FundamentalsTimeSeriesResult } from "yahoo-finance2/modules/fundamentalsTimeSeries";
import type { InsightsResult } from "yahoo-finance2/modules/insights";
import type { RecommendationsBySymbolResponse } from "yahoo-finance2/modules/recommendationsBySymbol";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";
import { yahooClient } from "./yahoo.client.js";

export type YahooRawScalar = string | number | boolean | Date | null | undefined;
export type YahooRawRecord = Record<string, unknown>;

export interface YahooQuoteRaw extends YahooRawRecord {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: unknown;
  postMarketPrice?: unknown;
  preMarketPrice?: unknown;
  regularMarketPreviousClose?: unknown;
  regularMarketChange?: unknown;
  regularMarketChangePercent?: unknown;
  currency?: string;
  fullExchangeName?: string;
  exchange?: string;
  quoteType?: string;
  marketState?: string;
  dividendRate?: unknown;
  dividendYield?: unknown;
  trailingAnnualDividendRate?: unknown;
  trailingAnnualDividendYield?: unknown;
  fiftyTwoWeekRange?: { low?: unknown; high?: unknown };
}

export interface YahooSearchQuoteRaw extends YahooRawRecord {
  symbol?: string;
  shortname?: string;
  longname?: string;
  name?: string;
  exchange?: string;
  exchDisp?: string;
  quoteType?: string;
  currency?: string;
}

export interface YahooSearchRaw extends YahooRawRecord {
  quotes?: YahooSearchQuoteRaw[];
  news?: YahooNewsRaw[];
}

/**
 * Réponse Yahoo telle que la voient les mappers : les dates redeviennent des chaînes après un
 * passage par le cache JSON, et Yahoo omet ou met à `null` n'importe quel champ, surtout sur les
 * valeurs européennes. Les types de yahoo-finance2 décrivent la forme ; cette enveloppe impose de
 * rester tolérant à la lecture.
 */
type YahooTolerant<T> = T extends Date
  ? Date | string
  : T extends readonly (infer U)[]
    ? YahooTolerant<U>[]
    : T extends object
      ? { [K in keyof T]?: YahooTolerant<T[K]> | null }
      : T;

export type YahooSummaryRaw = YahooTolerant<QuoteSummaryResult>;

export interface YahooChartPointRaw extends YahooRawRecord {
  date?: string | number | Date;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
  volume?: unknown;
}

export interface YahooDividendRaw extends YahooRawRecord {
  date?: string | number | Date;
  amount?: unknown;
}

type YahooChartSplitRaw = YahooTolerant<ChartEventSplit>;

export interface YahooChartRaw extends YahooRawRecord {
  quotes?: YahooChartPointRaw[];
  /** Tableaux avec `return: "array"`, objets indexés par date sinon. */
  events?: {
    dividends?: Record<string, YahooDividendRaw> | YahooDividendRaw[];
    splits?: Record<string, YahooChartSplitRaw> | YahooChartSplitRaw[];
  };
}

export type YahooInsightsRaw = YahooTolerant<InsightsResult>;
export type YahooRecommendationsRaw = YahooTolerant<RecommendationsBySymbolResponse>;

/** Lignes `fundamentalsTimeSeries` : une ligne par période, une colonne par indicateur. */
export type YahooFinancialTimeSeriesRaw = YahooTolerant<FundamentalsTimeSeriesResult>[];

export interface YahooNewsRaw extends YahooRawRecord {
  title?: string;
  link?: string;
  url?: string;
  summary?: string;
  description?: string;
  publisher?: string;
  provider?: string;
  providerPublishTime?: unknown;
  publishTime?: unknown;
  publishedAt?: unknown;
  pubDate?: unknown;
  imageUrl?: string;
  thumbnail?: {
    originalUrl?: string;
    url?: string;
    resolutions?: { url?: string }[];
  };
  relatedTickers?: unknown[];
}

export interface YahooScreenerRaw extends YahooRawRecord {
  quotes?: YahooQuoteRaw[];
  finance?: { result?: { quotes?: YahooQuoteRaw[] }[] };
}

interface YahooClientAdapter {
  quote(symbol: string): Promise<YahooQuoteRaw>;
  quote(symbols: string[], options: { return: "array" }): Promise<YahooQuoteRaw[]>;
  quoteCombine(symbol: string): Promise<YahooQuoteRaw>;
  quoteSummary(symbol: string, options: { modules: string[] }, moduleOptions?: YahooRawRecord): Promise<YahooSummaryRaw>;
  chart(symbol: string, options: YahooRawRecord): Promise<YahooChartRaw>;
  search(query: string, options: YahooRawRecord, moduleOptions?: YahooRawRecord): Promise<YahooSearchRaw>;
  screener(options: YahooRawRecord, queryOptions?: unknown, validationOptions?: YahooRawRecord): Promise<YahooScreenerRaw>;
  fundamentalsTimeSeries(symbol: string, options: YahooRawRecord): Promise<YahooFinancialTimeSeriesRaw>;
  insights(symbol: string, options: YahooRawRecord, moduleOptions?: YahooRawRecord): Promise<YahooInsightsRaw>;
  recommendationsBySymbol(symbol: string, options?: YahooRawRecord, moduleOptions?: YahooRawRecord): Promise<YahooRecommendationsRaw>;
}

const client = yahooClient as unknown as YahooClientAdapter;

export function yahooQuote(symbol: string) {
  return client.quote(symbol);
}

export function yahooQuoteBatch(symbols: string[]) {
  return client.quote(symbols, { return: "array" });
}

export function yahooQuoteCombine(symbol: string) {
  return client.quoteCombine(symbol);
}

/**
 * Résumé multi-modules non validé : Yahoo omet régulièrement des champs que le schéma de
 * yahoo-finance2 exige (ex. `earningsChart.quarterly` des valeurs européennes), ce qui ferait
 * échouer tout l'appel pour un seul module incomplet. Les mappers lisent la réponse de façon tolérante.
 */
export function yahooQuoteSummary(symbol: string, modules: string[]) {
  return client.quoteSummary(symbol, { modules }, { validateResult: false });
}

export function yahooChart(symbol: string, options: YahooRawRecord) {
  return client.chart(symbol, { ...options, return: "array" });
}

export function yahooSearch(query: string, options: YahooRawRecord) {
  return client.search(query, options, { validateResult: false });
}

export function yahooScreener(scrIds: string, count: number) {
  return client.screener({ scrIds, count }, undefined, { validateOptions: false, validateResult: false });
}

export function yahooFundamentalsTimeSeries(symbol: string, options: YahooRawRecord) {
  return client.fundamentalsTimeSeries(symbol, options);
}

/** Signaux techniques : réponse non validée, lue par un mapper tolérant (couverture européenne partielle). */
export function yahooInsights(symbol: string) {
  return client.insights(symbol, { lang: "fr-FR", reportsCount: 0 }, { validateResult: false });
}

/** Symboles proches selon Yahoo, réponse non validée. */
export function yahooRecommendationsBySymbol(symbol: string) {
  return client.recommendationsBySymbol(symbol, {}, { validateResult: false });
}

export function rawRecord(value: unknown): YahooRawRecord {
  return value && typeof value === "object" ? value as YahooRawRecord : {};
}

export function rawArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}
