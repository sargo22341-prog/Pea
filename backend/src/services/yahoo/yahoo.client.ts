import Bottleneck from "bottleneck";
import YahooFinance from "yahoo-finance2";
import type { MarketDataResult } from "../market/data/market-data-provider.js";
import { HttpError } from "../../utils/http-error.js";
import { dedupeInFlight } from "../shared/inFlightDeduper.js";
import { logger } from "../shared/logger.service.js";
import { yahooCircuitBreaker } from "./circuit-breaker.js";
import { errorMessage, isTemporaryYahooError, toYahooHttpError } from "./yahoo.errors.js";
import { logMarketData, roundMs, symbolFromKey } from "./utils/logging.js";
import { recordYahooUsage, type YahooUsageMetadata } from "./yahoo-usage.service.js";

/** Durée maximale d'une requête HTTP Yahoo : au-delà, elle est abandonnée et traitée comme temporaire. */
const yahooRequestTimeoutMs = 15_000;
/**
 * Durée maximale d'un appel dans la file (il peut enchaîner récupération du crumb et requête) :
 * un appel bloqué libère sa place au lieu de geler toute la donnée de marché.
 */
const yahooJobExpirationMs = 45_000;
/** Nombre d'appels en attente au-delà duquel les nouveaux sont refusés plutôt que mis en file. */
const yahooQueueHighWater = 200;

/** `fetch` borné par un délai, utilisé par yahoo-finance2 (le défaut d'undici est d'environ 5 min). */
export function createTimeoutFetch(timeoutMs: number) {
  return (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
  };
}

export const yahooClient = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"], fetch: createTimeoutFetch(yahooRequestTimeoutMs) });

/** Appel refusé (file saturée) ou expiré par le limiteur : la donnée est indisponible pour l'instant. */
function queueUnavailableError(error: InstanceType<typeof Bottleneck.BottleneckError>) {
  return new HttpError(503, "Yahoo Finance est temporairement indisponible (file d'appels saturee ou trop lente).", {
    provider: "Yahoo Finance",
    cause: error.message
  });
}

/**
 * File qui sérialise les appels réels vers Yahoo Finance : 250ms minimum entre deux appels et un
 * seul appel concurrent, car Yahoo bloque les rafales. Les hits de cache ne la traversent pas
 * (voir safeYahooCall). Un appel expiré libère sa place ; une file pleine refuse les nouveaux.
 */
export function createYahooCallScheduler(options: { jobExpirationMs: number; queueHighWater: number }) {
  const limiter = new Bottleneck({
    minTime: 250,
    maxConcurrent: 1,
    highWater: options.queueHighWater,
    strategy: Bottleneck.strategy.OVERFLOW
  });
  return async function schedule<T>(key: string, fn: () => Promise<T>, metadata?: YahooUsageMetadata): Promise<T> {
    try {
      return await limiter.schedule({ expiration: options.jobExpirationMs }, async () => {
        const startedAt = performance.now();
        try {
          const result = await yahooCircuitBreaker.execute(fn);
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
    } catch (error) {
      if (error instanceof Bottleneck.BottleneckError) throw queueUnavailableError(error);
      throw error;
    }
  };
}

export const scheduleYahooCall = createYahooCallScheduler({ jobExpirationMs: yahooJobExpirationMs, queueHighWater: yahooQueueHighWater });

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

interface SafeYahooCallOptions {
  /** Logue le motif quand le cache stale est servi en fallback. */
  logFallbackReason?: string;
}

/**
 * Enveloppe standard : cache frais, appel Yahoo dedupe, ecriture cache puis fallback stale.
 *
 * Le `getCached` est appelé deux fois :
 *   - avant Yahoo : pour servir un cache frais sans appeler Yahoo
 *   - en cas d'échec Yahoo : pour servir un fallback stale, MAIS seulement si l'implémentation
 *     `getCached` n'a pas elle-même filtré les entrées trop anciennes (via staleRejectSeconds).
 *     Concrètement, si `getCached()` retourne null, on lève l'erreur Yahoo plutôt que de servir
 *     une donnée d'il y a 1 an.
 */
export async function safeYahooCall<T>(
  key: string,
  fn: () => Promise<T>,
  getCached: () => MarketDataResult<T> | null,
  setCached: (data: T) => void,
  options: SafeYahooCallOptions = {}
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
    // Re-lit le cache pour pouvoir servir une entrée stale si le getCached d'origine ne l'avait
    // pas trouvée fraîche. Le helper readCache filtre désormais les entrées au-delà du seuil de
    // rejet, donc si on a quelque chose ici, c'est récent (par rapport au seuil métier).
    const fallback = getCached();
    if (fallback) {
      logMarketData("cache-hit", {
        provider: "local-cache",
        method: key,
        symbol: symbolFromKey(key),
        stale: true,
        reason: options.logFallbackReason ?? "yahoo-error",
        durationMs: cacheMs
      });
      return { data: fallback.data, stale: true };
    }

    throw toYahooHttpError(error);
  }
}
