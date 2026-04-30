/**
 * Role du fichier : recuperer les top gainers/losers Yahoo Finance et les
 * mettre en cache pour la journee calendaire locale du serveur.
 */

import type { TopAndLosersResponse, TopMover } from "@pea/shared";
import { dedupeInFlight } from "../../shared/inFlightDeduper.js";
import { logger } from "../../shared/logger.service.js";
import { retryTemporary, yahooClient } from "../yahoo.client.js";
import { errorMessage, toYahooHttpError } from "../yahoo.errors.js";

type ScreenerId = "day_gainers" | "day_losers";

let cache: TopAndLosersResponse | null = null;

/** Retourne la date locale serveur au format YYYY-MM-DD pour invalider le cache a minuit local. */
function todayCacheDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Transforme une valeur Yahoo optionnelle en nombre fini, sinon undefined. */
function finiteNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

/** Transforme une valeur Yahoo optionnelle en chaine non vide, sinon undefined. */
function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Mappe les quotes brutes du screener Yahoo vers le DTO expose au frontend. */
function mapScreenerQuotes(rawQuotes: unknown): TopMover[] {
  if (!Array.isArray(rawQuotes)) return [];

  return rawQuotes
    .map((quote): TopMover | null => {
      const row = quote as Record<string, unknown>;
      const symbol = optionalString(row.symbol);
      const price = finiteNumber(row.regularMarketPrice);
      const changePercent = finiteNumber(row.regularMarketChangePercent);
      const change = finiteNumber(row.regularMarketChange);

      if (!symbol || price === undefined || changePercent === undefined || change === undefined) return null;

      return {
        symbol,
        shortName: optionalString(row.shortName) ?? optionalString(row.displayName) ?? optionalString(row.longName),
        price,
        changePercent,
        change,
        currency: optionalString(row.currency)
      };
    })
    .filter((item): item is TopMover => Boolean(item))
    .slice(0, 5);
}

/** Appelle un screener Yahoo unique, la version installee ne type pas plusieurs scrIds en un appel. */
async function fetchScreener(scrId: ScreenerId): Promise<TopMover[]> {
  const result = await retryTemporary(`screener:${scrId}`, () => yahooClient.screener({ scrIds: scrId, count: 5 }));
  return mapScreenerQuotes((result as { quotes?: unknown })?.quotes);
}

/** Retourne les top gainers/losers du jour avec un cache valide seulement pour la date locale courante. */
export async function fetchTopAndLosers(): Promise<TopAndLosersResponse> {
  const cacheDate = todayCacheDate();
  if (cache?.cacheDate === cacheDate) {
    logger.debug("market-data", "Yahoo top movers cache hit", { cacheDate, cachedAt: cache.cachedAt });
    return cache;
  }

  try {
    const [gainers, losers] = await dedupeInFlight(`top-and-losers:${cacheDate}`, () =>
      Promise.all([fetchScreener("day_gainers"), fetchScreener("day_losers")])
    );

    cache = {
      gainers,
      losers,
      cachedAt: new Date().toISOString(),
      cacheDate
    };

    logger.debug("market-data", "Yahoo top movers fetched", { cacheDate, gainers: gainers.length, losers: losers.length });
    return cache;
  } catch (error) {
    logger.warn("market-data", "Yahoo top movers error", { cacheDate, error: errorMessage(error) });
    throw toYahooHttpError(error);
  }
}
