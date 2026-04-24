import Bottleneck from "bottleneck";
import YahooFinance from "yahoo-finance2";
import type { DividendEvent, HistoryPoint, Quote, RangeKey, SearchResult } from "@pea/shared";
import { config } from "../config.js";
import { db } from "../db.js";
import { HttpError } from "../utils/http-error.js";
import { buildHistoricalOptions, getCurrentTradingDay } from "../utils/range.js";
import type { MarketDataProvider, MarketDataResult } from "./market-data-provider.js";
import { safeString } from "./peaEligibility.js";

type CacheTable = "cached_quotes" | "cached_dividends";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
const limiter = new Bottleneck({
  minTime: 250,
  maxConcurrent: 1
});

const searchCache = new Map<string, { payload: SearchResult[]; fetchedAt: number }>();
const quoteCombineCache = new Map<string, { payload: Quote[]; fetchedAt: number }>();
const nowSeconds = () => Math.floor(Date.now() / 1000);
export const yahooClient = yahoo;

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

function readHistoryCache(symbol: string, range: RangeKey, interval: string, ttlSeconds: number): MarketDataResult<HistoryPoint[]> | null {
  const cacheKey = historyCacheKey(symbol, range, interval);
  const row = db.prepare("SELECT payload, fetched_at FROM cached_history WHERE cache_key = ?").get(cacheKey) as
    | { payload: string; fetched_at: number }
    | undefined;

  if (!row) return null;
  const stale = nowSeconds() - Number(row.fetched_at) > ttlSeconds;
  return { data: JSON.parse(String(row.payload)) as HistoryPoint[], stale };
}

function readIntradayCache(symbol: string, tradingDay = getCurrentTradingDay(symbol)): (MarketDataResult<HistoryPoint[]> & { tradingDay: string }) | null {
  const cacheKey = intradayCacheKey(symbol, tradingDay);
  const row = db.prepare("SELECT payload, trading_day, last_updated_at FROM cached_intraday_history WHERE cache_key = ?").get(cacheKey) as
    | { payload: string; trading_day: string; last_updated_at: number }
    | undefined;

  if (!row) {
    const fallback = db.prepare(
      "SELECT payload, trading_day, last_updated_at FROM cached_intraday_history WHERE symbol = ? AND range = '1d' AND interval = '2m' ORDER BY last_updated_at DESC LIMIT 1"
    ).get(symbol.toUpperCase()) as { payload: string; trading_day: string; last_updated_at: number } | undefined;
    if (!fallback) return null;
    return { data: JSON.parse(String(fallback.payload)) as HistoryPoint[], stale: true, tradingDay: String(fallback.trading_day) };
  }

  const stale = String(row.trading_day) !== tradingDay || nowSeconds() - Number(row.last_updated_at) > 90;
  return { data: JSON.parse(String(row.payload)) as HistoryPoint[], stale, tradingDay: String(row.trading_day) };
}

function writeCache(table: CacheTable, symbol: string, payload: unknown) {
  db.prepare(
    `INSERT INTO ${table} (symbol, payload, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
  ).run(symbol.toUpperCase(), JSON.stringify(payload), nowSeconds());
}

function writeHistoryCache(symbol: string, range: RangeKey, interval: string, payload: HistoryPoint[]) {
  db.prepare(
    `INSERT INTO cached_history (cache_key, symbol, range, payload, fetched_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
  ).run(historyCacheKey(symbol, range, interval), symbol.toUpperCase(), range, JSON.stringify(payload), nowSeconds());
}

function writeIntradayCache(symbol: string, payload: HistoryPoint[], tradingDay = getCurrentTradingDay(symbol)) {
  db.prepare(
    `INSERT INTO cached_intraday_history (cache_key, symbol, range, interval, trading_day, payload, last_updated_at)
     VALUES (?, ?, '1d', '2m', ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, last_updated_at = excluded.last_updated_at`
  ).run(intradayCacheKey(symbol, tradingDay), symbol.toUpperCase(), tradingDay, JSON.stringify(payload), nowSeconds());
}

function historyCacheKey(symbol: string, range: RangeKey, interval: string) {
  return `${symbol.toUpperCase()}:${range}:${interval}`;
}

function intradayCacheKey(symbol: string, tradingDay: string) {
  return `${symbol.toUpperCase()}:1d:2m:${tradingDay}`;
}

function mapChartRows(rows: any[], period2?: Date | string | number): HistoryPoint[] {
  const end = period2 ? new Date(period2).getTime() : Date.now();
  return rows
    .filter((row: any) => row.date && Number.isFinite(Number(row.close)) && new Date(row.date).getTime() <= end)
    .map((row: any) => ({
      date: new Date(row.date).toISOString(),
      open: Number.isFinite(Number(row.open)) ? Number(row.open) : undefined,
      high: Number.isFinite(Number(row.high)) ? Number(row.high) : undefined,
      low: Number.isFinite(Number(row.low)) ? Number(row.low) : undefined,
      volume: Number.isFinite(Number(row.volume)) ? Number(row.volume) : undefined,
      close: Number(row.close)
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function sanitizeIntradayPoints(symbol: string, points: HistoryPoint[]): HistoryPoint[] {
  const byDate = new Map<string, HistoryPoint>();
  for (const point of points) {
    const time = new Date(point.date).getTime();
    const close = Number(point.close);
    if (!Number.isFinite(time) || !Number.isFinite(close) || close <= 0) {
      console.info(`[intraday-sanitize] ${symbol} removed invalid point close=${point.close} date=${point.date}`);
      continue;
    }
    byDate.set(new Date(point.date).toISOString(), { ...point, date: new Date(point.date).toISOString(), close });
  }

  const sanitized = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (sanitized.length >= 2) {
    const previous = sanitized[sanitized.length - 2];
    const last = sanitized[sanitized.length - 1];
    const delta = Math.abs(last.close - previous.close) / previous.close;
    if (Number.isFinite(delta) && delta > 0.2) {
      console.info(`[intraday-sanitize] ${symbol} removed invalid last point close=${last.close} previous=${previous.close}`);
      sanitized.pop();
    }
  }

  return sanitized;
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
    if (cached) {
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
    if (cached && nowSeconds() - cached.fetchedAt < 24 * 60 * 60) {
      return { data: cached.payload, stale: false };
    }

    try {
      const result = (await retryTemporary(`search:${normalizedQuery}`, () =>
        yahoo.search(normalizedQuery, { quotesCount: 10, newsCount: 0 })
      )) as any;

      const payload = (result.quotes ?? [])
        .map((item: any) => ({
          symbol: safeString(item?.symbol),
          name: safeString(item?.shortname) || safeString(item?.longname) || safeString(item?.name) || safeString(item?.symbol),
          exchange: safeString(item?.exchange) || safeString(item?.exchDisp),
          quoteType: safeString(item?.quoteType),
          currency: safeString(item?.currency)
        }))
        .filter((item: any) => item.symbol);

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

  async quoteCombine(symbols: string[]): Promise<MarketDataResult<Quote[]>> {
    const keys = [...new Set(symbols.map((symbol) => String(symbol ?? "").trim().toUpperCase()).filter(Boolean))];
    if (!keys.length) return { data: [], stale: false };

    const cacheKey = keys.sort().join(",");
    const cached = quoteCombineCache.get(cacheKey);
    if (cached && nowSeconds() - cached.fetchedAt < 60) return { data: cached.payload, stale: false };

    try {
      const rows = (await retryTemporary(`quoteCombine:${cacheKey}`, () => Promise.all(keys.map((key) => yahoo.quoteCombine(key))))) as any[];
      const payload: Quote[] = rows
        .filter((item) => item?.symbol)
        .map((item) => {
          const price = Number(item.regularMarketPrice ?? item.postMarketPrice ?? item.preMarketPrice ?? 0);
          const previousClose = item.regularMarketPreviousClose ? Number(item.regularMarketPreviousClose) : undefined;
          return {
            symbol: String(item.symbol).toUpperCase(),
            name: item.longName ?? item.shortName ?? item.symbol,
            price,
            previousClose,
            change: item.regularMarketChange ? Number(item.regularMarketChange) : price - (previousClose ?? price),
            changePercent: item.regularMarketChangePercent ? Number(item.regularMarketChangePercent) : undefined,
            currency: item.currency ?? "EUR",
            exchange: item.fullExchangeName ?? item.exchange,
            quoteType: item.quoteType,
            marketState: item.marketState
          };
        });
      quoteCombineCache.set(cacheKey, { payload, fetchedAt: nowSeconds() });
      return { data: payload, stale: false };
    } catch (error) {
      console.warn(`[market-data:yahoo] quoteCombine:${cacheKey}: ${errorMessage(error)}`);
      if (cached) return { data: cached.payload, stale: true };
      throw toYahooHttpError(error);
    }
  }

  async history(symbol: string, range: RangeKey): Promise<MarketDataResult<HistoryPoint[]>> {
    const key = symbol.toUpperCase();
    let quoteForRange: Quote | undefined;
    if (range === "1d") {
      try {
        quoteForRange = (await this.quote(key)).data;
      } catch {
        quoteForRange = undefined;
      }
    }
    const historicalOptions = buildHistoricalOptions(range, {
      symbol: key,
      exchange: quoteForRange?.exchange,
      fullExchangeName: quoteForRange?.exchange
    });
    const interval = String(historicalOptions.interval);
    const historyTtlSeconds = range === "1w" ? 15 * 60 : 60 * 60;
    const cacheReader = range === "1d" ? () => readIntradayCache(key, historicalOptions.tradingDay) : () => readHistoryCache(key, range, interval, historyTtlSeconds);
    const cacheWriter =
      range === "1d" ? (data: HistoryPoint[]) => writeIntradayCache(key, data, historicalOptions.tradingDay) : (data: HistoryPoint[]) => writeHistoryCache(key, range, interval, data);

    const result = await safeYahooCall<HistoryPoint[]>(
      `history:${key}:${range}`,
      async () => {
        const { tradingDay: _tradingDay, marketHours: _marketHours, ...yahooOptions } = historicalOptions;
        const rows = ((await yahoo.chart(key, { ...yahooOptions, return: "array" } as any)) as any).quotes ?? [];
        const mapped = mapChartRows(rows, historicalOptions.period2);
        const history = range === "1d" ? sanitizeIntradayPoints(key, mapped) : mapped;
        return history;
      },
      cacheReader,
      cacheWriter
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
