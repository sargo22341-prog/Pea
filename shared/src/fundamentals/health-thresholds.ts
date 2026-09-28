import type { HealthCategory, RatedHealthMetric } from "./health.js";

/**
 * Seuils de notation de la santé financière : source de vérité unique, utilisée par le backend
 * pour le verdict et par le frontend pour les pastilles et les explications.
 *
 * `good` et `weak` bornent les trois zones. Pour un indicateur « plus haut = mieux », une valeur
 * >= good est verte et < weak est rouge ; pour « plus bas = mieux », une valeur <= good est
 * verte et > weak est rouge.
 */
export interface HealthThreshold {
  category: HealthCategory;
  direction: "higher-is-better" | "lower-is-better";
  good: number;
  weak: number;
  /** Ne s'applique pas aux banques et assurances. */
  skipForFinancialSector?: boolean;
}

export const ROE_GOOD = 0.15;
export const ROE_WEAK = 0.05;
export const PROFIT_MARGIN_GOOD = 0.1;
export const PROFIT_MARGIN_WEAK = 0.03;
export const OPERATING_MARGIN_GOOD = 0.15;
export const OPERATING_MARGIN_WEAK = 0.05;
export const DEBT_TO_EQUITY_WARNING = 100;
export const DEBT_TO_EQUITY_DANGER = 200;
export const CURRENT_RATIO_GOOD = 1.5;
export const CURRENT_RATIO_WEAK = 1;
export const REVENUE_GROWTH_GOOD = 0.05;
export const REVENUE_GROWTH_WEAK = 0;
export const EARNINGS_GROWTH_GOOD = 0.05;
export const EARNINGS_GROWTH_WEAK = 0;

export const HEALTH_THRESHOLDS: Record<RatedHealthMetric, HealthThreshold> = {
  returnOnEquity: { category: "profitability", direction: "higher-is-better", good: ROE_GOOD, weak: ROE_WEAK },
  profitMargin: { category: "profitability", direction: "higher-is-better", good: PROFIT_MARGIN_GOOD, weak: PROFIT_MARGIN_WEAK },
  operatingMargin: { category: "profitability", direction: "higher-is-better", good: OPERATING_MARGIN_GOOD, weak: OPERATING_MARGIN_WEAK },
  debtToEquity: { category: "debt", direction: "lower-is-better", good: DEBT_TO_EQUITY_WARNING, weak: DEBT_TO_EQUITY_DANGER, skipForFinancialSector: true },
  currentRatio: { category: "debt", direction: "higher-is-better", good: CURRENT_RATIO_GOOD, weak: CURRENT_RATIO_WEAK, skipForFinancialSector: true },
  revenueGrowth: { category: "growth", direction: "higher-is-better", good: REVENUE_GROWTH_GOOD, weak: REVENUE_GROWTH_WEAK },
  earningsGrowth: { category: "growth", direction: "higher-is-better", good: EARNINGS_GROWTH_GOOD, weak: EARNINGS_GROWTH_WEAK }
};

/** Nombre minimal d'indicateurs notés pour qu'un verdict global ait du sens. */
export const HEALTH_VERDICT_MIN_METRICS = 2;
