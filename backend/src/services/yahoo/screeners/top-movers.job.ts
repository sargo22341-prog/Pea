/**
 * Role du fichier : recuperer les top gainers/losers Yahoo Finance et les
 * mettre en cache pour la journee calendaire locale du serveur.
 */

import type { MarketListId, MarketListResponse, TopAndLosersResponse, TopMover } from "@pea/shared";
import { dedupeInFlight } from "../../shared/inFlightDeduper.js";
import { logger } from "../../shared/logger.service.js";
import { retryTemporary, yahooClient } from "../yahoo.client.js";
import { errorMessage } from "../yahoo.errors.js";

type ScreenerListId = Exclude<MarketListId, "trending_fr">;

let cache: TopAndLosersResponse | null = null;
const listCache = new Map<MarketListId, MarketListResponse>();
const LIST_COUNT = 10;

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
        shortName: optionalString(row.shortName) ?? optionalString(row.displayName) ?? optionalString(row.longName) ?? symbol,
        price,
        changePercent,
        change,
        currency: optionalString(row.currency)
      };
    })
    .filter((item): item is TopMover => Boolean(item))
    .slice(0, LIST_COUNT);
}

/** Appelle un screener Yahoo unique, la version installee ne type pas plusieurs scrIds en un appel. */
async function fetchScreener(scrId: ScreenerListId): Promise<TopMover[]> {
  try {
    const result = await retryTemporary(`screener:${scrId}`, () =>
      yahooClient.screener({ scrIds: scrId, count: LIST_COUNT } as any, undefined, { validateOptions: false, validateResult: false } as any)
    );
    return mapScreenerQuotes((result as { quotes?: unknown })?.quotes);
  } catch (error) {
    logger.warn("market-data", "Yahoo screener fallback used", { screener: scrId, error: errorMessage(error) });
    return [];
  }
}

async function fetchTrendingFr(): Promise<TopMover[]> {
  try {
    const trending = await retryTemporary("trendingSymbols:FR", () =>
      yahooClient.trendingSymbols("FR", { count: LIST_COUNT, lang: "fr-FR", region: "FR" }, { validateResult: false })
    );
    const symbols = Array.isArray((trending as { quotes?: unknown })?.quotes)
      ? (trending as { quotes: Array<{ symbol?: unknown }> }).quotes
          .map((quote) => optionalString(quote.symbol))
          .filter((symbol): symbol is string => Boolean(symbol))
          .slice(0, LIST_COUNT)
      : [];

    if (!symbols.length) return [];

    const quotes = await retryTemporary(`quote:trendingSymbols:FR:${symbols.join(",")}`, () =>
      yahooClient.quote(symbols, { return: "array" } as any)
    );
    return mapScreenerQuotes(quotes);
  } catch (error) {
    logger.warn("market-data", "Yahoo trending symbols fallback used", { region: "FR", error: errorMessage(error) });
    return [];
  }
}

export async function fetchMarketList(id: MarketListId): Promise<MarketListResponse> {
  const cacheDate = todayCacheDate();
  const cached = listCache.get(id);
  if (cached?.cacheDate === cacheDate) {
    logger.debug("market-data", "Yahoo market list cache hit", { id, cacheDate, cachedAt: cached.cachedAt });
    return cached;
  }

  const items = await dedupeInFlight(`market-list:${id}:${cacheDate}`, () =>
    id === "trending_fr" ? fetchTrendingFr() : fetchScreener(id)
  );
  const response = {
    id,
    items,
    cachedAt: new Date().toISOString(),
    cacheDate
  };
  listCache.set(id, response);
  logger.debug("market-data", "Yahoo market list fetched", { id, cacheDate, items: items.length });
  return response;
}

function emptyTopAndLosersResponse(cacheDate: string): TopAndLosersResponse {
  return {
    gainers: [],
    losers: [],
    cachedAt: new Date().toISOString(),
    cacheDate
  };
}

/** Retourne les top gainers/losers du jour avec un cache valide seulement pour la date locale courante. */
export async function fetchTopAndLosers(): Promise<TopAndLosersResponse> {
  const cacheDate = todayCacheDate();
  if (cache?.cacheDate === cacheDate) {
    logger.debug("market-data", "Yahoo top movers cache hit", { cacheDate, cachedAt: cache.cachedAt });
    return cache;
  }

  try {
    const [gainers, losers] = await Promise.all([fetchMarketList("day_gainers"), fetchMarketList("day_losers")]);

    cache = {
      gainers: gainers.items,
      losers: losers.items,
      cachedAt: new Date().toISOString(),
      cacheDate
    };

    logger.debug("market-data", "Yahoo top movers fetched", { cacheDate, gainers: gainers.items.length, losers: losers.items.length });
    return cache;
  } catch (error) {
    logger.warn("market-data", "Yahoo top movers error", { cacheDate, error: errorMessage(error) });
    return cache ?? emptyTopAndLosersResponse(cacheDate);
  }
}
