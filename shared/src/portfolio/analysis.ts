/**
 * Onglets « Qualité » et répartitions complémentaires de la page Analyse. Toutes les pondérations
 * sont exprimées en points de pourcentage du portefeuille (25 = 25 %), comme les répartitions
 * existantes ; les ratios (rendement, taux de distribution) restent des fractions.
 */

/** Seuil au-delà duquel deux lignes sont jugées très corrélées (diversification illusoire). */
export const HIGH_CORRELATION_THRESHOLD = 0.8;

export interface PortfolioValuationItem {
  symbol: string;
  name: string;
  weight: number;
  trailingPE?: number | undefined;
  /** Rendement du dividende (fraction). */
  dividendYield?: number | undefined;
  beta?: number | undefined;
}

/** Indicateur pondéré et part du portefeuille (en points) sur laquelle il a pu être calculé. */
export interface WeightedPortfolioMetric {
  value?: number | undefined;
  coverage: number;
}

export interface PortfolioValuation {
  trailingPE: WeightedPortfolioMetric;
  dividendYield: WeightedPortfolioMetric;
  beta: WeightedPortfolioMetric;
  items: PortfolioValuationItem[];
}

export interface LookThroughSource {
  symbol: string;
  name: string;
  weight: number;
}

/** Une ligne détenue directement, via un ou plusieurs ETF, ou les deux. */
export interface LookThroughItem {
  key: string;
  symbol?: string | undefined;
  name: string;
  directWeight: number;
  viaEtfWeight: number;
  totalWeight: number;
  viaEtf: LookThroughSource[];
}

export interface PortfolioLookThrough {
  items: LookThroughItem[];
  /** Poids des ETF qui n'est pas détaillé (au-delà des dix premières lignes publiées, ou ETF sans détail). */
  undisclosedEtfWeight: number;
  /** ETF dont les lignes détenues sont connues. */
  etfCount: number;
}

export interface DividendSustainabilityItem {
  symbol: string;
  name: string;
  weight: number;
  /** Dividendes / bénéfice (fraction). */
  payoutRatio?: number | undefined;
  /** Flux de trésorerie disponible / dividendes versés, dernier exercice annuel en cache. */
  fcfCoverage?: number | undefined;
}

export type CapitalizationBucket = "large" | "mid" | "small" | "etf" | "unknown";

export interface CorrelationAsset {
  symbol: string;
  name: string;
}

export interface CorrelationPair {
  a: string;
  b: string;
  value: number;
}

export interface PortfolioCorrelation {
  assets: CorrelationAsset[];
  /** Matrice symétrique dans l'ordre de `assets` ; `null` quand une série est constante. */
  matrix: (number | null)[][];
  /** Rendements journaliers communs utilisés. */
  observations: number;
  /** Paires au-delà de `HIGH_CORRELATION_THRESHOLD`, de la plus corrélée à la moins corrélée. */
  highPairs: CorrelationPair[];
}
