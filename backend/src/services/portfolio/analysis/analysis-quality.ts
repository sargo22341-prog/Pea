import { DAY_MS, type AllocationChartItem, type DividendSustainabilityItem, type PortfolioAnalysis, type PortfolioValuationItem, type PositionWithMarket } from "@pea/shared";
import { candleRepository } from "../../../repositories/candles/candle.repository.js";
import { assetRepository } from "../../../repositories/market/asset.repository.js";
import { CALENDAR_DAYS_PER_TRADING_DAY } from "../../market/charts/moving-average.js";
import { holdingsFromSummary } from "../../yahoo/fundamentals/mappers/fund.mapper.js";
import { readCachedAnnualStatementRows } from "../../yahoo/statements/statements.job.js";
import { positionCapitalizationBucket, positionCurrency } from "./capitalization.js";
import { CORRELATION_MAX_ASSETS, CORRELATION_WINDOW_DAYS, correlationMatrix, type CloseSeries } from "./correlation.js";
import { dividendSustainabilityItem, sortBySustainability } from "./dividend-sustainability.js";
import { lookThroughExposure, type LookThroughPosition } from "./look-through.js";
import { addAllocation, finalizeAllocation, type Fundamentals } from "./portfolio-analysis.helpers.js";
import { portfolioValuation, valuationItem } from "./valuation.js";

/** Les corrélations se calculent sur les bougies journalières de l'historique complet. */
const DAILY_RANGE = "all";
const DAILY_INTERVAL = "1d";

export interface AnalyzedPosition {
  position: PositionWithMarket;
  fundamentals?: Fundamentals | undefined;
  /** Poids dans le portefeuille (points). */
  weight: number;
  etf: boolean;
  logoUrl?: string | undefined;
}

type QualityAnalysis = Pick<PortfolioAnalysis, "capitalizationAllocation" | "currencyAllocation" | "valuation" | "lookThrough" | "dividendSustainability" | "correlation">;

/** Clôtures journalières stockées des lignes les plus lourdes (aucun appel Yahoo). */
function readCloseSeries(entries: readonly AnalyzedPosition[], now: Date): CloseSeries[] {
  const sinceIso = new Date(now.getTime() - Math.ceil((CORRELATION_WINDOW_DAYS + 1) * CALENDAR_DAYS_PER_TRADING_DAY) * DAY_MS).toISOString();
  return [...entries]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, CORRELATION_MAX_ASSETS)
    .flatMap(({ position }) => {
      const asset = assetRepository.findBySymbol(position.symbol);
      if (!asset) return [];
      const closes = candleRepository
        .readCandles(asset.id, DAILY_RANGE, DAILY_INTERVAL, sinceIso)
        .map((candle) => ({ day: candle.date.slice(0, 10), close: candle.close }));
      return [{ symbol: position.symbol, name: position.name, closes }];
    });
}

/**
 * Onglets « Qualité » et répartitions complémentaires, calculés à partir des données déjà en cache
 * pour les positions de l'utilisateur courant uniquement.
 */
export function buildQualityAnalysis(entries: readonly AnalyzedPosition[], now = new Date()): QualityAnalysis {
  const capitalization = new Map<string, AllocationChartItem>();
  const currency = new Map<string, AllocationChartItem>();
  const valuationItems: PortfolioValuationItem[] = [];
  const lookThroughPositions: LookThroughPosition[] = [];
  const dividendItems: DividendSustainabilityItem[] = [];

  for (const { position, fundamentals, weight, etf, logoUrl } of entries) {
    addAllocation(capitalization, positionCapitalizationBucket(position, fundamentals, etf), position, weight, logoUrl);
    addAllocation(currency, positionCurrency(position), position, weight, logoUrl);
    valuationItems.push(valuationItem(position, fundamentals, weight));
    lookThroughPositions.push({
      symbol: position.symbol,
      name: position.name,
      weight,
      etf,
      holdings: etf && fundamentals ? holdingsFromSummary(fundamentals) : undefined
    });
    if (!etf) {
      const item = dividendSustainabilityItem(position, fundamentals, weight, readCachedAnnualStatementRows(position.symbol));
      if (item) dividendItems.push(item);
    }
  }

  return {
    capitalizationAllocation: finalizeAllocation(capitalization),
    currencyAllocation: finalizeAllocation(currency),
    valuation: portfolioValuation(valuationItems),
    lookThrough: lookThroughExposure(lookThroughPositions),
    dividendSustainability: sortBySustainability(dividendItems),
    correlation: entries.length >= 2 ? correlationMatrix(readCloseSeries(entries, now)) : undefined
  };
}
