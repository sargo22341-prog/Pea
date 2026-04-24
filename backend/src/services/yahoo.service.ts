import Bottleneck from "bottleneck";
import YahooFinance from "yahoo-finance2";
import type { DividendEvent, HistoryPoint, Quote, RangeKey, SearchResult } from "@pea/shared";
import { config } from "../config.js";
import { db } from "../db.js";
import { HttpError } from "../utils/http-error.js";
import { marketDebug } from "../utils/market-debug.js";
import { buildHistoricalOptions } from "../utils/range.js";
import type { MarketDataProvider, MarketDataResult } from "./market-data-provider.js";
import { evaluatePeaEligibility, rankAssetForPea, safeString, sortAssetsForPea } from "./peaEligibility.js";

type CacheTable = "cached_quotes" | "cached_dividends";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
const limiter = new Bottleneck({
  minTime: 1200,
  maxConcurrent: 1
});

const searchCache = new Map<string, { payload: SearchResult[]; fetchedAt: number }>();
const nowSeconds = () => Math.floor(Date.now() / 1000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markStale<T extends object>(data: T, stale: boolean): T & { stale?: boolean } {
  return { ...data, stale };
}

function markStaleList<T extends object>(data: T[], stale: boolean): Array<T & { stale?: boolean }> {
  return data.map((item) => markStale(item, stale));
}

function readCache<T>(table: CacheTable, symbol: string, ttlSeconds: number): MarketDataResult<T> | null {
  const row = db.prepare(`SELECT payload, fetched_at FROM ${table} WHERE symbol = ?`).get(symbol.toUpperCase()) as
    | { payload: string; fetched_at: number }
    | undefined;

  if (!row) return null;
  const stale = nowSeconds() - Number(row.fetched_at) > ttlSeconds;
  return { data: JSON.parse(String(row.payload)) as T, stale };
}

function readHistoryCache(symbol: string, range: RangeKey, ttlSeconds: number): MarketDataResult<HistoryPoint[]> | null {
  const cacheKey = historyCacheKey(symbol, range);
  const row = db.prepare("SELECT payload, fetched_at FROM cached_history WHERE cache_key = ?").get(cacheKey) as
    | { payload: string; fetched_at: number }
    | undefined;

  if (!row) return null;
  const stale = nowSeconds() - Number(row.fetched_at) > ttlSeconds;
  return { data: JSON.parse(String(row.payload)) as HistoryPoint[], stale };
}

function writeCache(table: CacheTable, symbol: string, payload: unknown) {
  db.prepare(
    `INSERT INTO ${table} (symbol, payload, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
  ).run(symbol.toUpperCase(), JSON.stringify(payload), nowSeconds());
}

function writeHistoryCache(symbol: string, range: RangeKey, payload: HistoryPoint[]) {
  db.prepare(
    `INSERT INTO cached_history (cache_key, symbol, range, payload, fetched_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
  ).run(historyCacheKey(symbol, range), symbol.toUpperCase(), range, JSON.stringify(payload), nowSeconds());
}

function historyCacheKey(symbol: string, range: RangeKey) {
  return `${symbol.toUpperCase()}:${range}`;
}

function resampleTo30Minutes(rows: any[], period2: Date): HistoryPoint[] {
  const buckets = new Map<number, { date: Date; open: number; high: number; low: number; close: number; volume: number }>();
  const end = period2.getTime();

  for (const row of rows) {
    const date = new Date(row.date);
    const time = date.getTime();
    const close = Number(row.close);
    if (!Number.isFinite(time) || !Number.isFinite(close) || time > end) continue;

    const bucketStart = Math.floor(time / (30 * 60 * 1000)) * 30 * 60 * 1000;
    const open = Number.isFinite(Number(row.open)) ? Number(row.open) : close;
    const high = Number.isFinite(Number(row.high)) ? Number(row.high) : close;
    const low = Number.isFinite(Number(row.low)) ? Number(row.low) : close;
    const volume = Number.isFinite(Number(row.volume)) ? Number(row.volume) : 0;
    const bucket = buckets.get(bucketStart);

    if (!bucket) {
      buckets.set(bucketStart, { date: new Date(bucketStart), open, high, low, close, volume });
      continue;
    }

    bucket.high = Math.max(bucket.high, high);
    bucket.low = Math.min(bucket.low, low);
    bucket.close = close;
    bucket.volume += volume;
  }

  return [...buckets.values()]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((bucket) => ({
      date: bucket.date.toISOString(),
      open: bucket.open,
      high: bucket.high,
      low: bucket.low,
      close: bucket.close,
      volume: bucket.volume
    }));
}

function logIntradayChart(symbol: string, options: unknown, rawRows: any[], resampled: HistoryPoint[]) {
  if (!config.debugMarketData) return;

  const previewRaw = rawRows.slice(0, 3).map((row: any) => ({
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume
  }));
  const tailRaw = rawRows.slice(-3).map((row: any) => ({
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume
  }));

  marketDebug("market-data:intraday", {
    symbol,
    options,
    rawCount: rawRows.length,
    resampledCount: resampled.length,
    rawFirst: previewRaw,
    rawLast: tailRaw,
    resampledFirst: resampled.slice(0, 3),
    resampledLast: resampled.slice(-3)
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown) {
  if (typeof error !== "object" || !error) return undefined;
  const candidate = error as { code?: unknown; status?: unknown; statusCode?: unknown };
  return candidate.status ?? candidate.statusCode ?? candidate.code;
}

export function isTemporaryYahooError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  const code = errorCode(error);

  return (
    code === 429 ||
    code === 401 ||
    message.includes("too many requests") ||
    message.includes("edge: too many requests") ||
    message.includes("invalid crumb") ||
    message.includes("user is not logged in") ||
    message.includes("unauthorized") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("fetch failed") ||
    message.includes("yahoo finance n") ||
    message.includes("invalid options")
  );
}

export function isMarketDataUnavailable(error: unknown) {
  return error instanceof HttpError ? [401, 429, 502].includes(error.status) : isTemporaryYahooError(error);
}

function toYahooHttpError(error: unknown): HttpError {
  const message = errorMessage(error);
  const code = errorCode(error);

  if (isTemporaryYahooError(error)) {
    const status = code === 401 || message.toLowerCase().includes("unauthorized") ? 401 : 429;
    return new HttpError(status, "Yahoo Finance est temporairement indisponible ou limite les requêtes.", {
      provider: "Yahoo Finance",
      cause: message
    });
  }

  return new HttpError(502, "Yahoo Finance n’a pas pu fournir la donnée demandée.", {
    provider: "Yahoo Finance",
    cause: message
  });
}

async function retryTemporary<T>(key: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await limiter.schedule(fn);
    } catch (error) {
      lastError = error;
      if (!isTemporaryYahooError(error) || attempt === attempts - 1) break;
      const delay = 600 * 2 ** attempt;
      console.warn(`[market-data:yahoo] temporary error on ${key}, retrying in ${delay}ms: ${errorMessage(error)}`);
      await sleep(delay);
    }
  }

  throw lastError;
}

async function safeYahooCall<T>(
  key: string,
  fn: () => Promise<T>,
  getCached: () => MarketDataResult<T> | null,
  setCached: (data: T) => void
): Promise<MarketDataResult<T>> {
  const cached = getCached();
  if (cached && !cached.stale) return cached;

  try {
    const data = await retryTemporary(key, fn);
    setCached(data);
    return { data, stale: false };
  } catch (error) {
    console.warn(`[market-data:yahoo] ${key}: ${errorMessage(error)}`);
    if (cached && isTemporaryYahooError(error)) {
      return { data: cached.data, stale: true };
    }

    throw toYahooHttpError(error);
  }
}

export class YahooService implements MarketDataProvider {
  async search(query: string): Promise<MarketDataResult<SearchResult[]>> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return { data: [], stale: false };

    const cached = searchCache.get(normalizedQuery);
    if (cached && nowSeconds() - cached.fetchedAt < 60 * 60) {
      return { data: cached.payload, stale: false };
    }

    try {
      const result = (await retryTemporary(`search:${normalizedQuery}`, () =>
        yahoo.search(normalizedQuery, { quotesCount: 10, newsCount: 0 })
      )) as any;

      const payload = sortAssetsForPea((result.quotes ?? [])
        .map((item: any) => ({
          symbol: safeString(item?.symbol),
          name: safeString(item?.shortname) || safeString(item?.longname) || safeString(item?.name) || safeString(item?.symbol),
          exchange: safeString(item?.exchange) || safeString(item?.exchDisp),
          quoteType: safeString(item?.quoteType),
          currency: safeString(item?.currency)
        }))
        .filter((item: any) => item.symbol)).map((item) => ({
        ...item,
        peaEligibility: evaluatePeaEligibility(item),
        peaRank: rankAssetForPea(item)
      }));

      searchCache.set(normalizedQuery, { payload, fetchedAt: nowSeconds() });
      return { data: payload, stale: false };
    } catch (error) {
      console.warn(`[market-data:yahoo] search:${normalizedQuery}: ${errorMessage(error)}`);
      if (cached && isTemporaryYahooError(error)) {
        return { data: cached.payload, stale: true };
      }

      throw toYahooHttpError(error);
    }
  }

  async quote(symbol: string): Promise<MarketDataResult<Quote>> {
    const key = symbol.toUpperCase();

    const result = await safeYahooCall<Quote>(
      `quote:${key}`,
      async () => {
        const item = (await yahoo.quote(key)) as any;
        const price = Number(item.regularMarketPrice ?? item.postMarketPrice ?? item.preMarketPrice ?? 0);
        const previousClose = item.regularMarketPreviousClose ? Number(item.regularMarketPreviousClose) : undefined;

        const quote: Quote = {
          symbol: key,
          name: item.longName ?? item.shortName ?? key,
          price,
          previousClose,
          change: item.regularMarketChange ? Number(item.regularMarketChange) : price - (previousClose ?? price),
          changePercent: item.regularMarketChangePercent ? Number(item.regularMarketChangePercent) : undefined,
          currency: item.currency ?? "EUR",
          exchange: item.fullExchangeName ?? item.exchange,
          quoteType: item.quoteType,
          marketState: item.marketState,
          dividendRate: item.trailingAnnualDividendRate ? Number(item.trailingAnnualDividendRate) : undefined,
          dividendYield: item.trailingAnnualDividendYield ? Number(item.trailingAnnualDividendYield) : undefined,
          logoUrl: item.logoUrl
        };

        return quote;
      },
      () => readCache<Quote>("cached_quotes", key, config.yahooCacheTtlSeconds),
      (data) => writeCache("cached_quotes", key, data)
    );

    return { data: markStale(result.data, result.stale), stale: result.stale };
  }

  async history(symbol: string, range: RangeKey): Promise<MarketDataResult<HistoryPoint[]>> {
    const key = symbol.toUpperCase();
    const historicalOptions = buildHistoricalOptions(range);

    const result = await safeYahooCall<HistoryPoint[]>(
      `history:${key}:${range}`,
      async () => {
        const rows = ((await yahoo.chart(key, { ...historicalOptions, return: "array" } as any)) as any).quotes ?? [];
        if (range === "1d") {
          const resampled = resampleTo30Minutes(rows, historicalOptions.period2 instanceof Date ? historicalOptions.period2 : new Date());
          logIntradayChart(key, historicalOptions, rows, resampled);
          return resampled;
        }

        const history: HistoryPoint[] = rows
          .filter((row: any) => row.date && row.close)
          .map((row: any) => ({
            date: new Date(row.date).toISOString(),
            open: Number.isFinite(Number(row.open)) ? Number(row.open) : undefined,
            high: Number.isFinite(Number(row.high)) ? Number(row.high) : undefined,
            low: Number.isFinite(Number(row.low)) ? Number(row.low) : undefined,
            volume: Number.isFinite(Number(row.volume)) ? Number(row.volume) : undefined,
            close: Number(row.close)
          }));
        return history;
      },
      () => readHistoryCache(key, range, 60 * 60),
      (data) => writeHistoryCache(key, range, data)
    );

    return { data: markStaleList(result.data, result.stale), stale: result.stale };
  }

  async dividends(symbol: string): Promise<MarketDataResult<DividendEvent[]>> {
    const key = symbol.toUpperCase();

    const result = await safeYahooCall<DividendEvent[]>(
      `dividends:${key}`,
      async () => {
        const period1 = new Date();
        period1.setFullYear(period1.getFullYear() - 5);
        const chart = (await yahoo.chart(
          key,
          { ...buildHistoricalOptions("max", { period1 }), events: "div", return: "array" } as any
        )) as any;
        const rows = chart.events?.dividends ?? [];

        const quote = await this.quote(key);
        const dividends: DividendEvent[] = rows
          .filter((row: any) => row.date && row.amount)
          .map((row: any) => ({
            symbol: key,
            date: new Date(row.date).toISOString(),
            amount: Number(row.amount),
            currency: quote.data.currency,
            status: "real" as const
          }));
        return dividends;
      },
      () => readCache<DividendEvent[]>("cached_dividends", key, 60 * 60 * 12),
      (data) => writeCache("cached_dividends", key, data)
    );

    return { data: markStaleList(result.data, result.stale), stale: result.stale };
  }
}

export const yahooService = new YahooService();
export const marketDataProvider: MarketDataProvider = yahooService;
