/** Consensus des analystes (module Yahoo `financialData`). */
export interface AssetAnalystConsensus {
  currentPrice?: number | undefined;
  targetHighPrice?: number | undefined;
  targetLowPrice?: number | undefined;
  targetMeanPrice?: number | undefined;
  targetMedianPrice?: number | undefined;
  recommendationMean?: number | undefined;
  recommendationKey?: string | undefined;
  numberOfAnalystOpinions?: number;
}

/** Répartition des recommandations d'un mois (`0m` = mois courant, `-3m` = il y a trois mois). */
export interface AnalystRecommendationPeriod {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export type AnalystTrendDirection = "more-positive" | "stable" | "more-negative";
export type AnalystGradeAction = "up" | "down" | "init" | "main" | "reit" | "other";

/** Relèvement, abaissement ou maintien de recommandation d'un cabinet. */
export interface AnalystGradeChange {
  date: string;
  firm: string;
  action: AnalystGradeAction;
  fromGrade?: string | undefined;
  toGrade?: string | undefined;
}

/** Évolution du consensus (modules `recommendationTrend` et `upgradeDowngradeHistory`). */
export interface AssetAnalystTrend {
  /** Du plus ancien au mois courant. */
  periods: AnalystRecommendationPeriod[];
  /** Comparaison du mois courant avec le plus ancien mois disponible. */
  direction?: AnalystTrendDirection | undefined;
  /** Dix changements les plus récents, du plus récent au plus ancien. */
  history: AnalystGradeChange[];
}
