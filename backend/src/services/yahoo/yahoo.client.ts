/**
 * Role du fichier : posseder l'instance yahoo-finance2 et le rate limiter global.
 * Les jobs passent par retryTemporary/safeYahooCall pour garder le comportement
 * de retry, dedupe et fallback cache de l'ancien service.
 */

import Bottleneck from "bottleneck";
import YahooFinance from "yahoo-finance2";
import type { MarketDataResult } from "../market-data-provider.js";
import { dedupeInFlight } from "../inFlightDeduper.js";
import { logger } from "../logger.service.js";
import { errorMessage, isTemporaryYahooError, toYahooHttpError } from "./yahoo.errors.js";
import { logMarketData, roundMs, symbolFromKey } from "./utils/logging.js";

export const yahooClient = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

const limiter = new Bottleneck({
  minTime: 250,
  maxConcurrent: 1
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Execute un appel Yahoo avec le rate limiter et quelques retries sur erreurs temporaires. */
export async function retryTemporary<T>(key: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await limiter.schedule(fn);
    } catch (error) {
      lastError = error;
      if (!isTemporaryYahooError(error) || attempt === attempts - 1) break;
      const delay = 600 * 2 ** attempt;
      logger.warn("market-data", "Yahoo temporary error, retrying", { key, delayMs: delay, error: errorMessage(error) });
      await sleep(delay);
    }
  }

  throw lastError;
}

/** Enveloppe standard : cache frais, appel Yahoo dedupe, ecriture cache puis fallback stale. */
export async function safeYahooCall<T>(
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
    logger.warn("market-data", "Yahoo fetch error", { key, error: errorMessage(error) });
    if (cached) {
      logMarketData("cache-hit", { provider: "local-cache", method: key, symbol: symbolFromKey(key), stale: true, reason: "yahoo-error", durationMs: cacheMs });
      return { data: cached.data, stale: true };
    }

    throw toYahooHttpError(error);
  }
}
