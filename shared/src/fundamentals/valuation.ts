/**
 * Indicateurs de valorisation (modules Yahoo `defaultKeyStatistics`, `summaryDetail`, `price`).
 * Les variations sur 52 semaines sont des fractions (0,12 = +12 %).
 */
export interface AssetValuation {
  trailingPE?: number | undefined;
  forwardPE?: number | undefined;
  priceToBook?: number | undefined;
  priceToSales?: number | undefined;
  trailingEps?: number | undefined;
  forwardEps?: number | undefined;
  marketCap?: number | undefined;
  enterpriseValue?: number | undefined;
  enterpriseToEbitda?: number | undefined;
  beta?: number | undefined;
  floatShares?: number | undefined;
  fiftyTwoWeekChange?: number | undefined;
  indexFiftyTwoWeekChange?: number | undefined;
  lastSplitFactor?: string | undefined;
  lastSplitDate?: string | undefined;
  currency?: string | undefined;
}

/**
 * Un ratio cours / bénéfice (ou valeur d'entreprise / EBITDA) négatif ou nul n'a pas de sens
 * économique : il est affiché « non significatif » plutôt que comme un nombre.
 */
export function isMeaningfulMultiple(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}
