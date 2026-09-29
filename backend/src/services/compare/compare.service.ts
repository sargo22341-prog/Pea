import type { AssetMarketInfo, CompareAssetDto, Quote } from "@pea/shared";
import { config } from "../../config.js";
import { dataConstructionQueue } from "../market/construction/data-construction-queue.service.js";
import { marketDataGateway } from "../market/data/market-data-gateway.service.js";
import { logger } from "../shared/logger.service.js";
import { readCachedExtraData, readCachedFundamentalsSummary, type FundamentalsExtraData } from "../yahoo/fundamentals/fundamentals.job.js";
import { marketInfoFromSummary } from "../yahoo/fundamentals/mappers/market-info.mapper.js";

interface CompareFundamentals {
  extraData: FundamentalsExtraData;
  marketInfo: AssetMarketInfo;
  stale: boolean;
  found: boolean;
}

const EMPTY: CompareFundamentals = { extraData: {}, marketInfo: {}, stale: false, found: false };

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Mode live : comme la fiche actif, aucune lecture Yahoo synchrone ; un cache absent ou périmé est
 * reconstruit en arrière-plan. Sinon, lecture via le cache fundamentals (Yahoo dédupliqué et limité).
 */
async function readCompareFundamentals(symbol: string): Promise<CompareFundamentals> {
  if (config.enableMarketLiveRefresh) {
    const summary = readCachedFundamentalsSummary(symbol);
    if (!summary || summary.stale) dataConstructionQueue.enqueueAnnexRefreshIfNotRecentlyQueued(symbol);
    if (!summary) return EMPTY;
    return {
      extraData: readCachedExtraData(symbol)?.data ?? {},
      marketInfo: marketInfoFromSummary(summary.data),
      stale: summary.stale,
      found: true
    };
  }
  try {
    const [extraData, marketInfo] = await Promise.all([
      marketDataGateway.readExtraDataWithCache(symbol),
      marketDataGateway.readMarketInfoWithCache(symbol)
    ]);
    return { extraData: extraData.data, marketInfo: marketInfo.data, stale: extraData.stale || marketInfo.stale, found: true };
  } catch (error) {
    logger.warn("market-data", "Comparateur : fondamentaux indisponibles", { symbol, error: errorText(error) });
    return EMPTY;
  }
}

async function readQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  try {
    const quotes = (await marketDataGateway.readQuoteBatchWithCache(symbols)).data;
    return new Map(quotes.filter((quote) => !quote.unavailable).map((quote) => [quote.symbol.toUpperCase(), quote]));
  } catch (error) {
    logger.warn("market-data", "Comparateur : cotations indisponibles", { symbols: symbols.join(","), error: errorText(error) });
    return new Map();
  }
}

export function toCompareAsset(symbol: string, quote: Quote | undefined, fundamentals: CompareFundamentals): CompareAssetDto {
  const { extraData, marketInfo } = fundamentals;
  const fund = extraData.fundDetails;
  const isEtf = Boolean(fund) || (quote?.quoteType ?? "").toUpperCase().includes("ETF");
  return {
    symbol,
    name: quote?.name ?? symbol,
    isEtf,
    currency: quote?.currency ?? marketInfo.currency,
    price: marketInfo.regularMarketPrice ?? quote?.price,
    valuation: extraData.valuation,
    financialHealth: isEtf ? undefined : extraData.financialHealth,
    dividend: {
      yield: marketInfo.dividendYield ?? quote?.dividendYield,
      rate: marketInfo.dividendRate ?? quote?.dividendRate,
      payoutRatio: isEtf ? undefined : marketInfo.payoutRatio
    },
    analystConsensus: isEtf ? undefined : extraData.analystConsensus,
    fundDetails: fund
      ? { annualReportExpenseRatio: fund.annualReportExpenseRatio, totalNetAssets: fund.totalNetAssets, trailingReturns: fund.trailingReturns, risk: fund.risk }
      : undefined,
    stale: fundamentals.stale || Boolean(quote?.stale),
    unavailable: !quote && !fundamentals.found
  };
}

/** Colonnes du comparateur, dans l'ordre des symboles demandés (déjà normalisés et dédoublonnés). */
export async function compareAssets(symbols: string[]): Promise<CompareAssetDto[]> {
  const [quotes, fundamentals] = await Promise.all([
    readQuotes(symbols),
    Promise.all(symbols.map((symbol) => readCompareFundamentals(symbol)))
  ]);
  return symbols.map((symbol, index) => toCompareAsset(symbol, quotes.get(symbol), fundamentals[index] ?? EMPTY));
}
