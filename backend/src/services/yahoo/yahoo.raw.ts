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

export interface YahooSummaryRaw extends YahooRawRecord {
  summaryProfile?: YahooRawRecord;
  assetProfile?: YahooRawRecord;
  price?: YahooRawRecord;
  summaryDetail?: YahooRawRecord;
  calendarEvents?: YahooRawRecord;
  financialData?: YahooRawRecord;
  fundProfile?: YahooRawRecord;
  fundPerformance?: YahooRawRecord;
  topHoldings?: YahooRawRecord;
}

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

export interface YahooChartRaw extends YahooRawRecord {
  quotes?: YahooChartPointRaw[];
  events?: {
    dividends?: Record<string, YahooDividendRaw>;
    splits?: Record<string, unknown>;
  };
}

export interface YahooFinancialTimeSeriesRaw extends YahooRawRecord {
  timeseries?: { result?: YahooRawRecord[] };
  result?: YahooRawRecord[];
}

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
    resolutions?: Array<{ url?: string }>;
  };
  relatedTickers?: unknown[];
}

export interface YahooScreenerRaw extends YahooRawRecord {
  quotes?: YahooQuoteRaw[];
  finance?: { result?: Array<{ quotes?: YahooQuoteRaw[] }> };
}

type YahooClientAdapter = {
  quote(symbol: string): Promise<YahooQuoteRaw>;
  quote(symbols: string[], options: { return: "array" }): Promise<YahooQuoteRaw[]>;
  quoteCombine(symbol: string): Promise<YahooQuoteRaw>;
  quoteSummary(symbol: string, options: { modules: string[] }): Promise<YahooSummaryRaw>;
  chart(symbol: string, options: YahooRawRecord): Promise<YahooChartRaw>;
  search(query: string, options: YahooRawRecord): Promise<YahooSearchRaw>;
  screener(options: YahooRawRecord, queryOptions?: unknown, validationOptions?: YahooRawRecord): Promise<YahooScreenerRaw>;
  fundamentalsTimeSeries(symbol: string, options: YahooRawRecord): Promise<YahooFinancialTimeSeriesRaw>;
};

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

export function yahooQuoteSummary(symbol: string, modules: string[]) {
  return client.quoteSummary(symbol, { modules });
}

export function yahooChart(symbol: string, options: YahooRawRecord) {
  return client.chart(symbol, { ...options, return: "array" });
}

export function yahooSearch(query: string, options: YahooRawRecord) {
  return client.search(query, options);
}

export function yahooScreener(scrIds: string, count: number) {
  return client.screener({ scrIds, count }, undefined, { validateOptions: false, validateResult: false });
}

export function yahooFundamentalsTimeSeries(symbol: string, options: YahooRawRecord) {
  return client.fundamentalsTimeSeries(symbol, options);
}

export function rawRecord(value: unknown): YahooRawRecord {
  return value && typeof value === "object" ? value as YahooRawRecord : {};
}

export function rawArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}
