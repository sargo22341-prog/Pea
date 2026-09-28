/**
 * Santé financière (module Yahoo `financialData`).
 * Marges, rentabilités et croissances sont des fractions (0,15 = 15 %). `debtToEquity` est
 * exprimé en pourcentage, comme le fournit Yahoo (53 = dette égale à 53 % des fonds propres).
 */
export interface AssetFinancialHealthMetrics {
  grossMargin?: number | undefined;
  operatingMargin?: number | undefined;
  profitMargin?: number | undefined;
  returnOnEquity?: number | undefined;
  returnOnAssets?: number | undefined;
  debtToEquity?: number | undefined;
  currentRatio?: number | undefined;
  quickRatio?: number | undefined;
  totalCash?: number | undefined;
  totalDebt?: number | undefined;
  freeCashflow?: number | undefined;
  operatingCashflow?: number | undefined;
  revenueGrowth?: number | undefined;
  earningsGrowth?: number | undefined;
}

export type HealthRating = "good" | "fair" | "weak";
export type HealthCategory = "profitability" | "debt" | "growth";
export type RatedHealthMetric = "returnOnEquity" | "profitMargin" | "operatingMargin" | "debtToEquity" | "currentRatio" | "revenueGrowth" | "earningsGrowth";

export interface AssetFinancialHealthVerdict {
  overall: HealthRating;
  categories: Partial<Record<HealthCategory, HealthRating>>;
}

export interface AssetFinancialHealth {
  metrics: AssetFinancialHealthMetrics;
  /** Banques et assurances : la dette est leur matière première, les ratios d'endettement ne s'appliquent pas. */
  isFinancialSector: boolean;
  currency?: string | undefined;
  /** Absent quand trop peu d'indicateurs notés sont disponibles pour conclure. */
  verdict?: AssetFinancialHealthVerdict | undefined;
}
