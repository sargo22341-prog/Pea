import type { AssetFinancialStatements, StatementsPeriod } from "@pea/shared";
import type { MarketDataResult } from "../../market/data/market-data-provider.js";
import { featureFlagsService } from "../../admin/feature-flags.service.js";
import { STATEMENTS_FRESH_TTL_S, STATEMENTS_STALE_REJECT_S } from "../cache/cache.constants.js";
import { readCache, writeCache } from "../cache/yahoo.cache.js";
import { readCachedFundamentalsSummary } from "../fundamentals/fundamentals.job.js";
import { statementRowsFromTimeSeries, trailingTwelveMonthsRow } from "../fundamentals/mappers/statement-rows.mapper.js";
import { rawString } from "../utils/raw-values.js";
import { safeYahooCall } from "../yahoo.client.js";
import { yahooFundamentalsTimeSeries, type YahooFinancialTimeSeriesRaw } from "../yahoo.raw.js";

type StatementModule = "balance-sheet" | "cash-flow";

/** Profondeur d'historique demandée : six exercices, ou deux ans de trimestres. */
const HISTORY_YEARS: Record<StatementsPeriod, number> = { annual: 6, quarterly: 2 };
/** Périodes renvoyées au graphique (hors ligne « 12 mois glissants »). */
const ROWS_LIMIT: Record<StatementsPeriod, number> = { annual: 5, quarterly: 8 };
const TIME_SERIES_TYPE: Record<StatementsPeriod, "annual" | "quarterly"> = { annual: "annual", quarterly: "quarterly" };

function cacheKey(symbol: string, period: StatementsPeriod, module: StatementModule) {
  return `${symbol}:${period}-${module}`;
}

function readSeriesCache(symbol: string, period: StatementsPeriod, module: StatementModule) {
  return readCache<YahooFinancialTimeSeriesRaw>("cached_fundamentals", cacheKey(symbol, period, module), STATEMENTS_FRESH_TTL_S, STATEMENTS_STALE_REJECT_S);
}

function fetchSeries(symbol: string, period: StatementsPeriod, module: StatementModule): Promise<MarketDataResult<YahooFinancialTimeSeriesRaw>> {
  return safeYahooCall<YahooFinancialTimeSeriesRaw>(
    `fundamentals-timeseries:${symbol}:${period}-${module}`,
    () => {
      const period1 = new Date();
      period1.setFullYear(period1.getFullYear() - HISTORY_YEARS[period]);
      return yahooFundamentalsTimeSeries(symbol, { period1, period2: new Date(), module, type: TIME_SERIES_TYPE[period] });
    },
    () => readSeriesCache(symbol, period, module),
    (data) => { writeCache("cached_fundamentals", cacheKey(symbol, period, module), data); }
  );
}

function statementsCurrency(symbol: string) {
  const summary = readCachedFundamentalsSummary(symbol)?.data;
  return rawString(summary?.financialData?.financialCurrency) ?? rawString(summary?.price?.currency);
}

/**
 * Bilan et flux de trésorerie d'un actif. Le trimestriel n'est jamais appelé pour construire
 * l'annuel : la ligne « 12 mois glissants » n'est ajoutée que si les trimestres sont déjà en cache.
 * Chaque période est soumise à son interrupteur (403 sans appel Yahoo quand il est coupé).
 */
export async function fetchFinancialStatements(symbol: string, period: StatementsPeriod): Promise<MarketDataResult<AssetFinancialStatements>> {
  featureFlagsService.assertEnabled(period === "annual" ? "extended_fundamentals" : "quarterly_statements");
  const key = symbol.toUpperCase();
  const [balance, cashFlow] = await Promise.all([fetchSeries(key, period, "balance-sheet"), fetchSeries(key, period, "cash-flow")]);
  const rows = statementRowsFromTimeSeries(balance.data, cashFlow.data).slice(-ROWS_LIMIT[period]);
  if (period === "annual" && featureFlagsService.isEnabled("quarterly_statements")) {
    const quarterlyBalance = readSeriesCache(key, "quarterly", "balance-sheet");
    const quarterlyCashFlow = readSeriesCache(key, "quarterly", "cash-flow");
    const ttm = quarterlyCashFlow ? trailingTwelveMonthsRow(statementRowsFromTimeSeries(quarterlyBalance?.data, quarterlyCashFlow.data)) : undefined;
    if (ttm && ttm.endDate > (rows.at(-1)?.endDate ?? "")) rows.push(ttm);
  }
  return {
    data: { symbol: key, period, currency: statementsCurrency(key), rows },
    stale: balance.stale || cashFlow.stale
  };
}
