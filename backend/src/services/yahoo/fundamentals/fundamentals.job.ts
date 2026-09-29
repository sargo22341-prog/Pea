import type { AssetDetails, AssetMarketInfo, FinancialYearItem } from "@pea/shared";
import { FUNDAMENTALS_FRESH_TTL_S, FUNDAMENTALS_STALE_REJECT_S } from "../cache/cache.constants.js";
import { readCache, writeCache } from "../cache/yahoo.cache.js";
import { safeYahooCall } from "../yahoo.client.js";
import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { logger } from "../../shared/logger.service.js";
import { replaceUpcomingCalendarEvents } from "../../../repositories/calendar-events/calendar-events.repository.js";
import { yahooFundamentalsTimeSeries, yahooQuoteSummary, type YahooFinancialTimeSeriesRaw, type YahooSummaryRaw } from "../yahoo.raw.js";
import { analystConsensusFromSummary } from "./mappers/analysts.mapper.js";
import { calendarEventInsertsFromSummary, calendarEventsDataFromSummary } from "./mappers/calendar.mapper.js";
import { fundDetailsFromSummary } from "./mappers/fund.mapper.js";
import { financialHealthFromSummary } from "./mappers/health.mapper.js";
import { marketInfoFromSummary } from "./mappers/market-info.mapper.js";
import { financialRowsFromTimeSeries } from "./mappers/statements.mapper.js";
import { valuationFromSummary } from "./mappers/valuation.mapper.js";
import { featureFlagsService } from "../../admin/feature-flags.service.js";
import { recordRecommendation } from "../../market/analysts/recommendation-history.service.js";
import { fundamentalsModules } from "./fundamentals-modules.js";
import { analystTrendFromSummary } from "./mappers/analyst-trend.mapper.js";
import { earningsFromSummary } from "./mappers/earnings.mapper.js";
import { recordSplitsFromKeyStatistics } from "./key-statistics-splits.js";

/** Profondeur d'historique demandée pour les comptes annuels. */
const ANNUAL_FINANCIALS_YEARS = 6;

/** Blocs de la fiche actif dérivés du cache fundamentals. */
export type FundamentalsExtraData = Partial<Pick<
  AssetDetails,
  "calendarEventsData" | "analystConsensus" | "fundDetails" | "valuation" | "financialHealth" | "analystTrend" | "earnings"
>>;

function financialsPeriod1() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - ANNUAL_FINANCIALS_YEARS);
  return date;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchAnnualFinancials(symbol: string): Promise<MarketDataResult<YahooFinancialTimeSeriesRaw>> {
  const key = symbol.toUpperCase();
  return safeYahooCall<YahooFinancialTimeSeriesRaw>(
    `fundamentals-timeseries:${key}:annual-financials`,
    () =>
      yahooFundamentalsTimeSeries(key, {
        period1: financialsPeriod1(),
        period2: new Date(),
        module: "financials",
        type: "annual"
      }),
    () =>
      readCache<YahooFinancialTimeSeriesRaw>(
        "cached_fundamentals",
        `${key}:annual-financials`,
        FUNDAMENTALS_FRESH_TTL_S,
        FUNDAMENTALS_STALE_REJECT_S
      ),
    (data) => { writeCache("cached_fundamentals", `${key}:annual-financials`, data); }
  );
}

/** Dérive les tables locales (calendrier, divisions d'action, consensus) d'un résumé Yahoo ; idempotent. */
function persistSummaryDerivedData(symbol: string, summary: YahooSummaryRaw, source: "fresh" | "cache") {
  try {
    replaceUpcomingCalendarEvents(symbol, calendarEventInsertsFromSummary(symbol, summary), new Date().toISOString());
  } catch (error) {
    logger.warn("market-data", `replaceUpcomingCalendarEvents failed (${source})`, { symbol, error: errorText(error) });
  }
  try {
    recordSplitsFromKeyStatistics(symbol, summary);
  } catch (error) {
    logger.warn("market-data", `recordSplitsFromKeyStatistics failed (${source})`, { symbol, error: errorText(error) });
  }
  try {
    recordRecommendation(symbol, analystConsensusFromSummary(summary)?.recommendationKey);
  } catch (error) {
    logger.warn("market-data", `recordRecommendation failed (${source})`, { symbol, error: errorText(error) });
  }
}

async function fetchFundamentalsSummary(symbol: string): Promise<MarketDataResult<YahooSummaryRaw>> {
  const key = symbol.toUpperCase();
  const persistence = { fresh: false };
  const result = await safeYahooCall<YahooSummaryRaw>(
    `fundamentals:${key}`,
    () => yahooQuoteSummary(key, fundamentalsModules(featureFlagsService.isEnabled("extended_fundamentals"))),
    () => readCache<YahooSummaryRaw>("cached_fundamentals", key, FUNDAMENTALS_FRESH_TTL_S, FUNDAMENTALS_STALE_REJECT_S),
    (data) => {
      writeCache("cached_fundamentals", key, data);
      persistSummaryDerivedData(key, data, "fresh");
      persistence.fresh = true;
    }
  );
  // Également sur les hits de cache : remplit les tables pour les caches antérieurs à leur création.
  if (!persistence.fresh) persistSummaryDerivedData(key, result.data, "cache");
  return result;
}

/** Récupère les fundamentals Yahoo sans les sous-modules financiers dépréciés de quoteSummary. */
export async function fetchFundamentals(symbol: string): Promise<MarketDataResult<YahooSummaryRaw & { annualFinancials?: FinancialYearItem[] }>> {
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
    logger.warn("market-data", "Yahoo fundamentalsTimeSeries fallback", { symbol: key, error: errorText(error) });
    return { data: result.data, stale: result.stale };
  }
}

export function readCachedFundamentalsSummary(symbol: string): MarketDataResult<YahooSummaryRaw> | null {
  return readCache<YahooSummaryRaw>(
    "cached_fundamentals",
    symbol.toUpperCase(),
    FUNDAMENTALS_FRESH_TTL_S,
    FUNDAMENTALS_STALE_REJECT_S
  );
}

/** Produit l'objet marketInfo à partir des fundamentals cachés ou frais. */
export async function fetchMarketInfo(symbol: string): Promise<MarketDataResult<AssetMarketInfo>> {
  const result = await fetchFundamentalsSummary(symbol);
  return { data: marketInfoFromSummary(result.data), stale: result.stale };
}

/** Blocs dérivés du résumé ; ceux de l'interrupteur `extended_fundamentals` disparaissent quand il est coupé. */
function extraDataFromSummary(summary: YahooSummaryRaw): FundamentalsExtraData {
  const extended = featureFlagsService.isEnabled("extended_fundamentals");
  return {
    calendarEventsData: calendarEventsDataFromSummary(summary),
    analystConsensus: analystConsensusFromSummary(summary),
    fundDetails: fundDetailsFromSummary(summary),
    valuation: valuationFromSummary(summary),
    financialHealth: financialHealthFromSummary(summary),
    analystTrend: extended ? analystTrendFromSummary(summary) : undefined,
    earnings: extended ? earningsFromSummary(summary) : undefined
  };
}

/** Produit les blocs de la fiche actif (calendrier, consensus, fonds, valorisation, santé) depuis le cache fundamentals. */
export async function fetchExtraData(symbol: string): Promise<MarketDataResult<FundamentalsExtraData>> {
  const result = await fetchFundamentalsSummary(symbol);
  return { data: extraDataFromSummary(result.data), stale: result.stale };
}

export function readCachedExtraData(symbol: string): MarketDataResult<FundamentalsExtraData> | null {
  const result = readCachedFundamentalsSummary(symbol);
  if (!result) return null;
  return { data: extraDataFromSummary(result.data), stale: result.stale };
}
