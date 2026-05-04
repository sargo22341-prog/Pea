/**
 * Role du fichier : recuperer les fundamentals Yahoo et produire marketInfo.
 */

import type { AssetAnalystConsensus, AssetCalendarEventsData, AssetFundDetails, AssetMarketInfo } from "@pea/shared";
import { readCache, writeCache } from "../cache/yahoo.cache.js";
import { safeYahooCall, yahooClient } from "../yahoo.client.js";
import type { MarketDataResult } from "../../market/market-data-provider.js";
import { logger } from "../../shared/logger.service.js";
import { analystConsensusFromSummary, calendarEventsDataFromSummary, financialRowsFromTimeSeries, fundDetailsFromSummary, marketInfoFromSummary } from "./fundamentals.mapper.js";
import { upsertCalendarEvents } from "../../calendar-events/calendar-events.repository.js";

const fundamentalsModules = [
  "assetProfile",
  "calendarEvents",
  "financialData",
  "fundProfile",
  "fundPerformance",
  "topHoldings",
  "summaryDetail",
  "price",
  "quoteType"
];

function financialsPeriod1() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 6);
  return date;
}

async function fetchAnnualFinancials(symbol: string): Promise<MarketDataResult<any[]>> {
  const key = symbol.toUpperCase();
  return safeYahooCall<any[]>(
    `fundamentals-timeseries:${key}:annual-financials`,
    () =>
      (yahooClient as any).fundamentalsTimeSeries(key, {
        period1: financialsPeriod1(),
        period2: new Date(),
        module: "financials",
        type: "annual"
      }),
    () => readCache<any[]>("cached_fundamentals", `${key}:annual-financials`, 7 * 24 * 60 * 60),
    (data) => writeCache("cached_fundamentals", `${key}:annual-financials`, data)
  );
}

async function fetchFundamentalsSummary(symbol: string): Promise<MarketDataResult<any>> {
  const key = symbol.toUpperCase();
  const result = await safeYahooCall<any>(
    `fundamentals:${key}`,
    () => yahooClient.quoteSummary(key, { modules: fundamentalsModules } as any),
    () => readCache<any>("cached_fundamentals", key, 7 * 24 * 60 * 60),
    (data) => {
      writeCache("cached_fundamentals", key, data);
      try { upsertCalendarEvents(key, data); } catch (err) {
        logger.warn("market-data", "upsertCalendarEvents failed (fresh)", { symbol: key, error: err instanceof Error ? err.message : String(err) });
      }
    }
  );
  // Upsert également sur les hits de cache : idempotent, permet de remplir la table
  // pour les caches qui existaient déjà avant la création de la table.
  try { upsertCalendarEvents(key, result.data); } catch (err) {
    logger.warn("market-data", "upsertCalendarEvents failed (cache)", { symbol: key, error: err instanceof Error ? err.message : String(err) });
  }
  return result;
}

/** Recupere les fundamentals Yahoo sans les sous-modules financiers deprecies de quoteSummary. */
export async function fetchFundamentals(symbol: string): Promise<MarketDataResult<any>> {
  const key = symbol.toUpperCase();
  const result = await fetchFundamentalsSummary(key);

  try {
    const financials = await fetchAnnualFinancials(key);
    return {
      data: {
        ...result.data,
        annualFinancials: financialRowsFromTimeSeries(financials.data)
      },
      stale: result.stale || financials.stale
    };
  } catch (error) {
    logger.warn("market-data", "Yahoo fundamentalsTimeSeries fallback", {
      symbol: key,
      error: error instanceof Error ? error.message : String(error)
    });
    return { data: result.data, stale: result.stale };
  }
}

/** Produit l'objet marketInfo a partir des fundamentals caches ou frais. */
export async function fetchMarketInfo(symbol: string): Promise<MarketDataResult<AssetMarketInfo>> {
  const result = await fetchFundamentalsSummary(symbol);
  return { data: marketInfoFromSummary(result.data), stale: result.stale };
}

/** Produit les donnees supplementaires (calendrier, consensus, fonds) depuis le cache fundamentals. */
export async function fetchExtraData(symbol: string): Promise<MarketDataResult<{
  calendarEventsData?: AssetCalendarEventsData;
  analystConsensus?: AssetAnalystConsensus;
  fundDetails?: AssetFundDetails;
}>> {
  const result = await fetchFundamentalsSummary(symbol);
  return {
    data: {
      calendarEventsData: calendarEventsDataFromSummary(result.data),
      analystConsensus: analystConsensusFromSummary(result.data),
      fundDetails: fundDetailsFromSummary(result.data)
    },
    stale: result.stale
  };
}
