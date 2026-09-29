import type { MarketListId, MarketListResponse, TopMover } from "@pea/shared";
import { dedupeInFlight } from "../../shared/inFlightDeduper.js";
import { logger } from "../../shared/logger.service.js";
import { retryTemporary, yahooClient } from "../yahoo.client.js";
import { errorMessage } from "../yahoo.errors.js";
import { yahooQuoteBatch, yahooScreener } from "../yahoo.raw.js";
import { MARKET_LIST_COUNT, mapScreenerQuotes } from "./screener.mapper.js";

type ScreenerListId = Exclude<MarketListId, "trending_fr">;

const listCache = new Map<MarketListId, MarketListResponse>();

/** Retourne la date locale serveur au format YYYY-MM-DD pour invalider le cache a minuit local. */
function todayCacheDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Appelle un screener Yahoo unique, la version installee ne type pas plusieurs scrIds en un appel. */
async function fetchScreener(scrId: ScreenerListId): Promise<TopMover[]> {
  try {
    const result = await retryTemporary(`screener:${scrId}`, () => yahooScreener(scrId, MARKET_LIST_COUNT));
    return mapScreenerQuotes(result.quotes);
  } catch (error) {
    logger.warn("market-data", "Yahoo screener fallback used", { screener: scrId, error: errorMessage(error) });
    return [];
  }
}

async function fetchTrendingFr(): Promise<TopMover[]> {
  try {
    const trending = await retryTemporary("trendingSymbols:FR", () =>
      yahooClient.trendingSymbols("FR", { count: MARKET_LIST_COUNT, lang: "fr-FR", region: "FR" }, { validateResult: false })
    );
    const symbols = Array.isArray((trending as { quotes?: unknown }).quotes)
      ? (trending as { quotes: { symbol?: unknown }[] }).quotes
          .map((quote) => (typeof quote.symbol === "string" ? quote.symbol.trim() : ""))
          .filter(Boolean)
          .slice(0, MARKET_LIST_COUNT)
      : [];

    if (!symbols.length) return [];

    const quotes = await retryTemporary(`quote:trendingSymbols:FR:${symbols.join(",")}`, () => yahooQuoteBatch(symbols));
    return mapScreenerQuotes(quotes);
  } catch (error) {
    logger.warn("market-data", "Yahoo trending symbols fallback used", { region: "FR", error: errorMessage(error) });
    return [];
  }
}

/** Une liste Yahoo Finance, en cache jusqu'à minuit (date locale serveur). */
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
  const response = { id, items, cachedAt: new Date().toISOString(), cacheDate };
  listCache.set(id, response);
  logger.debug("market-data", "Yahoo market list fetched", { id, cacheDate, items: items.length });
  return response;
}
