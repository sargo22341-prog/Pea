import Bottleneck from "bottleneck";
import YahooFinance from "yahoo-finance2";
import type { DividendEvent, HistoryPoint, Quote, RangeKey, SearchResult } from "@pea/shared";
import { config } from "../config.js";
import { db } from "../db.js";
import { HttpError } from "../utils/http-error.js";
import { buildHistoricalOptions, getCurrentTradingDay, type ChartDisplayInterval } from "../utils/range.js";
import { dedupeInFlight } from "./inFlightDeduper.js";
import { getLastTradingDay, shouldRefreshMarketData } from "./marketCalendar.service.js";
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

function roundMs(startedAt: number) {
  return Math.round(performance.now() - startedAt);
}

function symbolFromKey(key: string) {
  const [, symbol] = key.split(":");
  return symbol ? symbol.toUpperCase() : "n/a";
}

function logMarketData(message: string, details: Record<string, string | number | boolean | undefined>) {
  const parts = Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}=${value}`);
  console.info(`[market-data] ${message} ${parts.join(" ")}`.trim());
}

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
  return { data: sanitizeHistoryPoints(symbol.toUpperCase(), range, JSON.parse(String(row.payload)) as HistoryPoint[]), stale };
}

function readIntradayCache(symbol: string, tradingDay = getCurrentTradingDay(symbol)): (MarketDataResult<HistoryPoint[]> & { tradingDay: string; lastUpdatedAt: number }) | null {
  const cacheKey = intradayCacheKey(symbol, tradingDay);
  const row = db.prepare("SELECT payload, trading_day, last_updated_at FROM cached_intraday_history WHERE cache_key = ?").get(cacheKey) as
    | { payload: string; trading_day: string; last_updated_at: number }
    | undefined;

  if (!row) {
    const fallback = db.prepare(
      "SELECT payload, trading_day, last_updated_at FROM cached_intraday_history WHERE symbol = ? AND range = '1d' AND interval = '5m' ORDER BY last_updated_at DESC LIMIT 1"
    ).get(symbol.toUpperCase()) as { payload: string; trading_day: string; last_updated_at: number } | undefined;
    if (!fallback) return null;
    return {
      data: sanitizeHistoryPoints(symbol.toUpperCase(), "1d", JSON.parse(String(fallback.payload)) as HistoryPoint[]),
      stale: true,
      tradingDay: String(fallback.trading_day),
      lastUpdatedAt: Number(fallback.last_updated_at)
    };
  }

  const stale = String(row.trading_day) !== tradingDay || nowSeconds() - Number(row.last_updated_at) > 90;
  return {
    data: sanitizeHistoryPoints(symbol.toUpperCase(), "1d", JSON.parse(String(row.payload)) as HistoryPoint[]),
    stale,
    tradingDay: String(row.trading_day),
    lastUpdatedAt: Number(row.last_updated_at)
  };
}

function readLatestIntradayCache(symbol: string): (MarketDataResult<HistoryPoint[]> & { tradingDay: string; lastUpdatedAt: number }) | null {
  const row = db.prepare(
    "SELECT payload, trading_day, last_updated_at FROM cached_intraday_history WHERE symbol = ? AND range = '1d' AND interval = '5m' ORDER BY trading_day DESC, last_updated_at DESC LIMIT 1"
  ).get(symbol.toUpperCase()) as { payload: string; trading_day: string; last_updated_at: number } | undefined;
  if (!row) return null;
  return {
    data: sanitizeHistoryPoints(symbol.toUpperCase(), "1d", JSON.parse(String(row.payload)) as HistoryPoint[]),
    stale: true,
    tradingDay: String(row.trading_day),
    lastUpdatedAt: Number(row.last_updated_at)
  };
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
     VALUES (?, ?, '1d', '5m', ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, last_updated_at = excluded.last_updated_at`
  ).run(intradayCacheKey(symbol, tradingDay), symbol.toUpperCase(), tradingDay, JSON.stringify(payload), nowSeconds());
}

function historyCacheKey(symbol: string, range: RangeKey, interval: string) {
  return `${symbol.toUpperCase()}:${range}:${interval}`;
}

function intradayCacheKey(symbol: string, tradingDay: string) {
  return `${symbol.toUpperCase()}:1d:5m:${tradingDay}`;
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

function interpolatePoint(point: HistoryPoint, previous: HistoryPoint, next: HistoryPoint): HistoryPoint {
  const close = (previous.close + next.close) / 2;
  return {
    ...point,
    close,
    open: Number.isFinite(Number(point.open)) && Number(point.open) > 0 ? point.open : close,
    high: Number.isFinite(Number(point.high)) && Number(point.high) > 0 ? Math.max(Number(point.high), close) : Math.max(previous.close, close, next.close),
    low: Number.isFinite(Number(point.low)) && Number(point.low) > 0 ? Math.min(Number(point.low), close) : Math.min(previous.close, close, next.close)
  };
}

function findPreviousValid(points: HistoryPoint[], index: number): HistoryPoint | undefined {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (Number.isFinite(points[i].close) && points[i].close > 0) return points[i];
  }
  return undefined;
}

function findNextValid(points: HistoryPoint[], index: number): HistoryPoint | undefined {
  for (let i = index + 1; i < points.length; i += 1) {
    if (Number.isFinite(points[i].close) && points[i].close > 0) return points[i];
  }
  return undefined;
}

function isAberrantPoint(point: HistoryPoint, previous?: HistoryPoint, next?: HistoryPoint) {
  if (!Number.isFinite(point.close) || point.close <= 0) return true;
  if (!previous || !next || previous.close <= 0 || next.close <= 0) return false;

  const expected = (previous.close + next.close) / 2;
  if (!Number.isFinite(expected) || expected <= 0) return false;

  const pointDeviation = Math.abs(point.close - expected) / expected;
  const neighborDeviation = Math.abs(previous.close - next.close) / expected;
  return pointDeviation > 0.2 && neighborDeviation < 0.12;
}

function sanitizeHistoryPoints(symbol: string, range: RangeKey, points: HistoryPoint[]): HistoryPoint[] {
  const byDate = new Map<string, HistoryPoint>();
  let removedPoints = 0;
  let interpolatedPoints = 0;

  for (const point of points) {
    const time = new Date(point.date).getTime();
    const close = Number(point.close);
    if (!Number.isFinite(time) || !Number.isFinite(close)) {
      removedPoints += 1;
      if (config.debugChartData) {
        console.info(`[history-sanitize] ${symbol} ${range} removed invalid point close=${point.close} date=${point.date}`);
      }
      continue;
    }
    byDate.set(new Date(point.date).toISOString(), { ...point, date: new Date(point.date).toISOString(), close });
  }

  const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const sanitized: HistoryPoint[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const point = sorted[index];
    const previous = findPreviousValid(sorted, index);
    const next = findNextValid(sorted, index);

    if (isAberrantPoint(point, previous, next)) {
      if (previous && next) {
        interpolatedPoints += 1;
        sanitized.push(interpolatePoint(point, previous, next));
        if (config.debugChartData) {
          console.info(`[history-sanitize] ${symbol} ${range} interpolated aberrant point close=${point.close} previous=${previous.close} next=${next.close} date=${point.date}`);
        }
        continue;
      }

      removedPoints += 1;
      if (config.debugChartData) {
        console.info(`[history-sanitize] ${symbol} ${range} removed aberrant edge point close=${point.close} date=${point.date}`);
      }
      continue;
    }

    sanitized.push(point);
  }

  if (config.debugChartData && (removedPoints > 0 || interpolatedPoints > 0)) {
    console.info(`[history-sanitize] ${symbol} ${range} removed=${removedPoints} interpolated=${interpolatedPoints}`);
  }

  return sanitized;
}

function aggregateHistoryPoints(points: HistoryPoint[], displayInterval: ChartDisplayInterval): HistoryPoint[] {
  const bucketMs = displayInterval === "2h" ? 2 * 60 * 60 * 1000 : displayInterval === "4h" ? 4 * 60 * 60 * 1000 : 0;
  if (!bucketMs) return points;

  const buckets = new Map<number, HistoryPoint[]>();
  for (const point of points) {
    const time = new Date(point.date).getTime();
    if (!Number.isFinite(time)) continue;
    const bucketTime = Math.floor(time / bucketMs) * bucketMs;
    const bucket = buckets.get(bucketTime) ?? [];
    bucket.push(point);
    buckets.set(bucketTime, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucketTime, bucket]) => {
      const sorted = bucket.sort((a, b) => a.date.localeCompare(b.date));
      const closes = sorted.map((point) => Number(point.close)).filter(Number.isFinite);
      const highs = sorted.map((point) => Number(point.high ?? point.close)).filter(Number.isFinite);
      const lows = sorted.map((point) => Number(point.low ?? point.close)).filter(Number.isFinite);
      const volumes = sorted.map((point) => Number(point.volume ?? 0)).filter(Number.isFinite);
      return {
        date: new Date(bucketTime).toISOString(),
        open: sorted.find((point) => Number.isFinite(Number(point.open)))?.open ?? sorted[0]?.close,
        high: highs.length ? Math.max(...highs) : undefined,
        low: lows.length ? Math.min(...lows) : undefined,
        close: closes[closes.length - 1] ?? sorted[sorted.length - 1]?.close ?? 0,
        volume: volumes.length ? volumes.reduce((sum, volume) => sum + volume, 0) : undefined
      };
    })
    .filter((point) => Number.isFinite(point.close));
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
  const cacheStartedAt = performance.now();
  const cached = getCached();
  const cacheMs = roundMs(cacheStartedAt);
  if (cached && !cached.stale) {
    logMarketData("cache-hit", { provider: "local-cache", method: key, symbol: symbolFromKey(key), stale: false, durationMs: cacheMs });
    return cached;
  }

  const yahooStartedAt = performance.now();
  try {
    const data = await dedupeInFlight(key, async () => {
      logMarketData("external-fetch-start", { provider: "Yahoo Finance", method: key, symbol: symbolFromKey(key) });
      const payload = await retryTemporary(key, fn);
      logMarketData("external-fetch-ok", { provider: "Yahoo Finance", method: key, symbol: symbolFromKey(key), durationMs: roundMs(yahooStartedAt) });
      return payload;
    });
    setCached(data);
    return { data, stale: false };
  } catch (error) {
    logMarketData("external-fetch-error", { provider: "Yahoo Finance", method: key, symbol: symbolFromKey(key), durationMs: roundMs(yahooStartedAt) });
    console.warn(`[market-data:yahoo] ${key}: ${errorMessage(error)}`);
    if (cached) {
      logMarketData("cache-hit", { provider: "local-cache", method: key, symbol: symbolFromKey(key), stale: true, reason: "yahoo-error", durationMs: cacheMs });
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
      logMarketData("cache-hit", { provider: "memory-cache", method: "search", symbol: normalizedQuery, stale: false, durationMs: 0 });
      return { data: cached.payload, stale: false };
    }

    const yahooStartedAt = performance.now();
    try {
      const result = (await dedupeInFlight(`search:${normalizedQuery}`, async () => {
        logMarketData("external-fetch-start", { provider: "Yahoo Finance", method: "search", symbol: normalizedQuery });
        const payload = await retryTemporary(`search:${normalizedQuery}`, () =>
          yahoo.search(normalizedQuery, { quotesCount: 10, newsCount: 0 })
        );
        logMarketData("external-fetch-ok", { provider: "Yahoo Finance", method: "search", symbol: normalizedQuery, durationMs: roundMs(yahooStartedAt) });
        return payload;
      })) as any;

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
      logMarketData("external-fetch-error", { provider: "Yahoo Finance", method: "search", symbol: normalizedQuery, durationMs: roundMs(yahooStartedAt) });
      console.warn(`[market-data:yahoo] search:${normalizedQuery}: ${errorMessage(error)}`);
      if (cached && isTemporaryYahooError(error)) {
        logMarketData("cache-hit", { provider: "memory-cache", method: "search", symbol: normalizedQuery, stale: true, reason: "yahoo-error", durationMs: 0 });
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
    if (cached && nowSeconds() - cached.fetchedAt < 60) {
      logMarketData("cache-hit", { provider: "memory-cache", method: "quoteCombine", symbol: cacheKey, stale: false, durationMs: 0 });
      return { data: cached.payload, stale: false };
    }

    const yahooStartedAt = performance.now();
    try {
      const rows = (await dedupeInFlight(`quoteCombine:${cacheKey}`, async () => {
        logMarketData("external-fetch-start", { provider: "Yahoo Finance", method: "quoteCombine", symbol: cacheKey });
        const payload = await retryTemporary(`quoteCombine:${cacheKey}`, () => Promise.all(keys.map((key) => yahoo.quoteCombine(key))));
        logMarketData("external-fetch-ok", { provider: "Yahoo Finance", method: "quoteCombine", symbol: cacheKey, durationMs: roundMs(yahooStartedAt) });
        return payload;
      })) as any[];
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
      logMarketData("external-fetch-error", { provider: "Yahoo Finance", method: "quoteCombine", symbol: cacheKey, durationMs: roundMs(yahooStartedAt) });
      console.warn(`[market-data:yahoo] quoteCombine:${cacheKey}: ${errorMessage(error)}`);
      if (cached) {
        logMarketData("cache-hit", { provider: "memory-cache", method: "quoteCombine", symbol: cacheKey, stale: true, reason: "yahoo-error", durationMs: 0 });
        return { data: cached.payload, stale: true };
      }
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
    const marketSession = range === "1d" ? getLastTradingDay(key, quoteForRange?.exchange) : undefined;
    const historicalOptions = buildHistoricalOptions(range, {
      symbol: key,
      exchange: quoteForRange?.exchange,
      fullExchangeName: quoteForRange?.exchange,
      period1: marketSession?.period1,
      period2: marketSession?.period2
    });
    if (marketSession) {
      historicalOptions.tradingDay = marketSession.date;
      historicalOptions.period1 = marketSession.period1;
      historicalOptions.period2 = new Date(Math.min(marketSession.period2.getTime(), Date.now()));
    }
    const displayInterval = String(historicalOptions.displayInterval);
    const historyTtlSeconds = range === "1w" ? 15 * 60 : 60 * 60;
    const cacheReader = range === "1d" ? () => readIntradayCache(key, historicalOptions.tradingDay) : () => readHistoryCache(key, range, displayInterval, historyTtlSeconds);
    const cacheWriter =
      range === "1d" ? (data: HistoryPoint[]) => writeIntradayCache(key, data, historicalOptions.tradingDay) : (data: HistoryPoint[]) => writeHistoryCache(key, range, displayInterval, data);

    if (range === "1d") {
      const cached = readIntradayCache(key, historicalOptions.tradingDay);
      const latest = cached ?? readLatestIntradayCache(key);
      const updatedAt = latest?.lastUpdatedAt;
      if (latest && !shouldRefreshMarketData(key, quoteForRange?.exchange, updatedAt, range)) {
        logMarketData("cache-hit", { provider: "local-cache", method: `history:${key}:${range}`, symbol: key, stale: latest.stale, durationMs: 0 });
        return { data: markStaleList(latest.data, latest.stale), stale: latest.stale };
      }
    }

    const result = await safeYahooCall<HistoryPoint[]>(
      `history:${key}:${range}`,
      async () => {
        const { tradingDay: _tradingDay, marketHours: _marketHours, displayInterval: _displayInterval, ...yahooOptions } = historicalOptions;
        const chart = (await dedupeInFlight(`chart:${key}:${range}:${historicalOptions.interval}`, () =>
          yahoo.chart(key, { ...yahooOptions, return: "array" } as any)
        )) as any;
        const rows = chart.quotes ?? [];
        const mapped = sanitizeHistoryPoints(key, range, mapChartRows(rows, historicalOptions.period2));
        const aggregated = range === "1d" ? mapped : aggregateHistoryPoints(mapped, historicalOptions.displayInterval);
        const history = sanitizeHistoryPoints(key, range, aggregated);
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
        const { tradingDay: _tradingDay, marketHours: _marketHours, displayInterval: _displayInterval, ...yahooOptions } = buildHistoricalOptions("max", { period1 });
        const chart = (await dedupeInFlight(`chart:${key}:dividends:${yahooOptions.interval}`, () =>
          yahoo.chart(key, { ...yahooOptions, events: "div", return: "array" } as any)
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
