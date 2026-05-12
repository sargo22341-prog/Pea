/**
 * Role du fichier : posseder l'instance yahoo-finance2 et le rate limiter global.
 * Les jobs passent par retryTemporary/safeYahooCall pour garder le comportement
 * de retry, dedupe et fallback cache de l'ancien service.
 *
 * Ordre d'exécution dans safeYahooCall :
 *  1. Vérification du cache local AVANT de toucher le rate limiter.
 *     Si la donnée est fraîche, on retourne immédiatement sans passer par Bottleneck.
 *  2. Seulement si le cache est absent ou périmé, l'appel réseau est soumis au rate limiter.
 *  3. dedupeInFlight empêche N appels concurrents pour la même clé d'aller tous en file :
 *     un seul appel est émis, les N-1 autres attendent sa résolution.
 *  4. En cas d'erreur réseau, le cache périmé (stale) est retourné comme fallback.
 *
 * Conséquence : le rate limiter (minTime 250ms, maxConcurrent 1) ne pénalise que
 * les vrais appels réseau vers Yahoo Finance, pas les lectures de cache en mémoire.
 */

import Bottleneck from "bottleneck";
import YahooFinance from "yahoo-finance2";
import type { MarketDataResult } from "../market/market-data-provider.js";
import { dedupeInFlight } from "../shared/inFlightDeduper.js";
import { logger } from "../shared/logger.service.js";
import { errorMessage, isTemporaryYahooError, toYahooHttpError } from "./yahoo.errors.js";
import { logMarketData, roundMs, symbolFromKey } from "./utils/logging.js";
import { recordYahooUsage, type YahooUsageMetadata } from "./yahoo-usage.service.js";

export const yahooClient = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

// Rate limiter qui sérialise les appels réels vers Yahoo Finance.
// 250ms minimum entre deux appels, 1 seul appel concurrent autorisé.
// Ce limiteur n'est pas traversé pour les hits de cache (voir safeYahooCall).
const limiter = new Bottleneck({
  minTime: 250,
  maxConcurrent: 1
});

export function scheduleYahooCall<T>(key: string, fn: () => Promise<T>, metadata?: YahooUsageMetadata) {
  return limiter.schedule(async () => {
    const startedAt = performance.now();
    try {
      const result = await fn();
      recordYahooUsage(key, { durationMs: roundMs(startedAt), success: true, metadata });
      return result;
    } catch (error) {
      recordYahooUsage(key, {
        durationMs: roundMs(startedAt),
        success: false,
        errorMessage: errorMessage(error),
        metadata
      });
      throw error;
    }
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Execute un appel Yahoo avec le rate limiter et quelques retries sur erreurs temporaires. */
export async function retryTemporary<T>(key: string, fn: () => Promise<T>, attempts = 3, metadata?: YahooUsageMetadata): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await scheduleYahooCall(key, fn, metadata);
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
