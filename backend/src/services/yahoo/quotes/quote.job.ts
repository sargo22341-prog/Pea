import type { Quote, SearchResult } from "@pea/shared";
import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { dedupeInFlight } from "../../shared/inFlightDeduper.js";
import { logger } from "../../shared/logger.service.js";
import { safeString } from "../../assets/peaEligibility.js";
import { readCache, writeCache } from "../cache/yahoo.cache.js";
import { retryTemporary, safeYahooCall, yahooClient } from "../yahoo.client.js";
import { errorMessage, isTemporaryYahooError, toYahooHttpError } from "../yahoo.errors.js";
import { logMarketData, roundMs } from "../utils/logging.js";
import { markStale, nowSeconds } from "../utils/stale.js";
import { normalizeQuote } from "./quote.mapper.js";

const searchCache = new Map<string, { payload: SearchResult[]; fetchedAt: number }>();
const quoteCombineCache = new Map<string, { payload: Quote[]; fetchedAt: number }>();
const quoteCacheTtlSeconds = 0;

/** Recherche des symboles Yahoo, avec cache memoire 24h. */
export async function searchYahoo(query: string): Promise<MarketDataResult<SearchResult[]>> {
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
        yahooClient.search(normalizedQuery, { quotesCount: 10, newsCount: 0 })
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
    logger.warn("market-data", "Yahoo search error", { query: normalizedQuery, error: errorMessage(error) });
    if (cached && isTemporaryYahooError(error)) {
      logMarketData("cache-hit", { provider: "memory-cache", method: "search", symbol: normalizedQuery, stale: true, reason: "yahoo-error", durationMs: 0 });
      return { data: cached.payload, stale: true };
    }

    throw toYahooHttpError(error);
  }
}

/** Recupere une quote et la marque stale si elle vient d'un fallback cache. */
export async function fetchQuote(symbol: string): Promise<MarketDataResult<Quote>> {
  const key = symbol.toUpperCase();

  const result = await safeYahooCall<Quote>(
    `quote:${key}`,
    async () => {
      const item = (await yahooClient.quote(key)) as any;
      return normalizeQuote(item, key);
    },
    () => readCache<Quote>("cached_quotes", key, quoteCacheTtlSeconds),
    (data) => writeCache("cached_quotes", key, data)
  );

  return { data: markStale(result.data, result.stale), stale: result.stale };
}

/** Recupere plusieurs quotes via le batch natif Yahoo et preserve l'ordre demande. */
export async function fetchQuoteBatch(symbols: string[]): Promise<MarketDataResult<Quote[]>> {
  const keys = [...new Set(symbols.map((symbol) => String(symbol ?? "").trim().toUpperCase()).filter(Boolean))];
  if (!keys.length) return { data: [], stale: false };

  const cachedQuotes = new Map<string, Quote>();
  const staleCachedQuotes = new Map<string, Quote>();
  const symbolsToFetch: string[] = [];
  for (const key of keys) {
    const cached = readCache<Quote>("cached_quotes", key, quoteCacheTtlSeconds);
    if (cached && !cached.stale) {
      cachedQuotes.set(key, markStale(cached.data, false));
      logMarketData("cache-hit", { provider: "local-cache", method: "quoteBatch", symbol: key, stale: false, durationMs: 0 });
    } else {
      if (cached) staleCachedQuotes.set(key, markStale(cached.data, true));
      symbolsToFetch.push(key);
    }
  }

  if (!symbolsToFetch.length) {
    logger.debug("market-data", "quote batch fully cached", { symbols: keys.join(","), totalSymbols: keys.length, cacheHits: cachedQuotes.size });
    return { data: keys.map((key) => cachedQuotes.get(key)!).filter(Boolean), stale: false };
  }

  const yahooStartedAt = performance.now();
  try {
    const fetchedRows = (await dedupeInFlight(`quoteBatch:${symbolsToFetch.sort().join(",")}`, async () => {
      logMarketData("external-fetch-start", {
        provider: "Yahoo Finance",
        method: "quoteBatch",
        symbol: symbolsToFetch.join(","),
        batchSymbols: symbolsToFetch.length
      });
      const payload = await retryTemporary(`quoteBatch:${symbolsToFetch.join(",")}`, () =>
        yahooClient.quote(symbolsToFetch, { return: "array" } as any)
      );
      logMarketData("external-fetch-ok", {
        provider: "Yahoo Finance",
        method: "quoteBatch",
        symbol: symbolsToFetch.join(","),
        batchSymbols: symbolsToFetch.length,
        durationMs: roundMs(yahooStartedAt)
      });
      return payload;
    })) as any[];

    const fetchedQuotes = new Map<string, Quote>();
    for (const row of fetchedRows) {
      if (!row?.symbol) continue;
      const quote = normalizeQuote(row, String(row.symbol));
      fetchedQuotes.set(quote.symbol, quote);
      writeCache("cached_quotes", quote.symbol, quote);
    }

    logger.debug("market-data", "quote batch summary", {
      requestedSymbols: keys.join(","),
      fetchedSymbols: symbolsToFetch.join(","),
      totalSymbols: keys.length,
      cacheHits: cachedQuotes.size,
      fetchedCount: fetchedQuotes.size,
      durationMs: Math.round(performance.now() - yahooStartedAt)
    });

    const data = keys
      .map((key) => fetchedQuotes.get(key) ?? cachedQuotes.get(key) ?? staleCachedQuotes.get(key))
      .filter((quote): quote is Quote => Boolean(quote));
    return { data, stale: data.some((quote) => quote.stale) || data.length < keys.length };
  } catch (error) {
    logMarketData("external-fetch-error", {
      provider: "Yahoo Finance",
      method: "quoteBatch",
      symbol: symbolsToFetch.join(","),
      batchSymbols: symbolsToFetch.length,
      durationMs: roundMs(yahooStartedAt)
    });
    logger.warn("market-data", "Yahoo quote batch error", { symbols: symbolsToFetch.join(","), error: errorMessage(error) });

    const fallbackQuotes = keys
      .map((key) => cachedQuotes.get(key) ?? staleCachedQuotes.get(key))
      .filter((quote): quote is Quote => Boolean(quote));
    if (fallbackQuotes.length) return { data: fallbackQuotes.map((quote) => markStale(quote, true)), stale: true };
    throw toYahooHttpError(error);
  }
}

/** Recupere des quoteCombine un par un, avec cache memoire court d'une minute. */
export async function fetchQuoteCombine(symbols: string[]): Promise<MarketDataResult<Quote[]>> {
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
      const payload = await Promise.all(keys.map((key) => retryTemporary(`quoteCombine:${key}`, () => yahooClient.quoteCombine(key))));
      logMarketData("external-fetch-ok", { provider: "Yahoo Finance", method: "quoteCombine", symbol: cacheKey, durationMs: roundMs(yahooStartedAt) });
      return payload;
    })) as any[];
    const payload: Quote[] = rows
      .filter((item) => item?.symbol)
      .map((item) => normalizeQuote(item, String(item.symbol)));
    quoteCombineCache.set(cacheKey, { payload, fetchedAt: nowSeconds() });
    return { data: payload, stale: false };
  } catch (error) {
    logMarketData("external-fetch-error", { provider: "Yahoo Finance", method: "quoteCombine", symbol: cacheKey, durationMs: roundMs(yahooStartedAt) });
    logger.warn("market-data", "Yahoo quote batch error", { symbols: cacheKey, error: errorMessage(error) });
    if (cached) {
      logMarketData("cache-hit", { provider: "memory-cache", method: "quoteCombine", symbol: cacheKey, stale: true, reason: "yahoo-error", durationMs: 0 });
      return { data: cached.payload, stale: true };
    }
    throw toYahooHttpError(error);
  }
}
