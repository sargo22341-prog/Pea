import { isMeaningfulMultiple, type PortfolioValuation, type PortfolioValuationItem, type PositionWithMarket, type WeightedPortfolioMetric } from "@pea/shared";
import { riskFromPerformance } from "../../yahoo/fundamentals/mappers/fund.mapper.js";
import { marketInfoFromSummary } from "../../yahoo/fundamentals/mappers/market-info.mapper.js";
import { rawNumber } from "../../yahoo/utils/raw-values.js";
import type { Fundamentals } from "./portfolio-analysis.helpers.js";

/**
 * Indicateurs de valorisation d'une ligne, lus dans le cache fundamentals (aucun appel Yahoo).
 * Une action pour laquelle Yahoo publie un `summaryDetail` sans rendement ne verse pas de
 * dividende : son rendement vaut 0 plutôt qu'« inconnu », sinon le rendement pondéré serait gonflé.
 */
export function valuationItem(position: PositionWithMarket, fundamentals: Fundamentals | undefined, weight: number): PortfolioValuationItem {
  const detail = fundamentals?.summaryDetail;
  const knownYield = (fundamentals ? marketInfoFromSummary(fundamentals).dividendYield : undefined) ?? position.quote?.dividendYield;
  const fundBeta = fundamentals?.fundPerformance ? riskFromPerformance(fundamentals.fundPerformance)?.beta : undefined;
  return {
    symbol: position.symbol,
    name: position.name,
    weight,
    trailingPE: rawNumber(detail?.trailingPE),
    dividendYield: knownYield ?? (detail && Object.keys(detail).length ? 0 : undefined),
    beta: rawNumber(fundamentals?.defaultKeyStatistics?.beta) ?? rawNumber(detail?.beta) ?? fundBeta
  };
}

function weightedMetric(items: readonly PortfolioValuationItem[], read: (item: PortfolioValuationItem) => number | undefined, harmonic = false): WeightedPortfolioMetric {
  let coverage = 0;
  let sum = 0;
  for (const item of items) {
    const value = read(item);
    if (value === undefined || !Number.isFinite(value) || item.weight <= 0) continue;
    coverage += item.weight;
    sum += harmonic ? item.weight / value : item.weight * value;
  }
  if (coverage <= 0) return { coverage: 0 };
  return { value: harmonic ? coverage / sum : sum / coverage, coverage };
}

/**
 * Valorisation du portefeuille pondérée par la valeur de marché, sur les seules lignes qui ont la
 * donnée (`coverage` indique leur poids). Le PER est une moyenne harmonique : c'est le rapport
 * entre la valeur détenue et la part de bénéfices correspondante. Un PER négatif (perte) n'a pas de
 * sens dans une moyenne et la ligne est exclue.
 */
export function portfolioValuation(items: readonly PortfolioValuationItem[]): PortfolioValuation {
  return {
    trailingPE: weightedMetric(items, (item) => (isMeaningfulMultiple(item.trailingPE) ? item.trailingPE : undefined), true),
    dividendYield: weightedMetric(items, (item) => (item.dividendYield !== undefined && item.dividendYield >= 0 ? item.dividendYield : undefined)),
    beta: weightedMetric(items, (item) => item.beta),
    items: [...items].sort((a, b) => b.weight - a.weight)
  };
}
