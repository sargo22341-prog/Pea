/**
 * Données d'un fonds ou d'un ETF (modules Yahoo `fundProfile`, `topHoldings`, `fundPerformance`).
 *
 * Toutes les pondérations, rendements et ratios exprimés en pourcentage sont des fractions
 * (0,05 = 5 %) : le mapper backend normalise les valeurs que Yahoo fournit en points.
 */
export interface AssetFundDetails {
  family?: string | undefined;
  annualReportExpenseRatio?: number | undefined;
  annualHoldingsTurnover?: number | undefined;
  totalNetAssets?: number | undefined;
  sectorWeightings?: { key: string; value: number }[] | undefined;
  holdings?: AssetFundHolding[] | undefined;
  allocation?: AssetFundAllocation | undefined;
  trailingReturns?: AssetFundTrailingReturns | undefined;
  annualReturns?: AssetFundAnnualReturn[] | undefined;
  risk?: AssetFundRisk | undefined;
}

export interface AssetFundHolding {
  symbol?: string | undefined;
  name: string;
  weight: number;
}

export interface AssetFundAllocation {
  stock?: number | undefined;
  bond?: number | undefined;
  cash?: number | undefined;
  other?: number | undefined;
}

export interface AssetFundTrailingReturns {
  asOfDate?: string | undefined;
  ytd?: number | undefined;
  oneYear?: number | undefined;
  threeYear?: number | undefined;
  fiveYear?: number | undefined;
  tenYear?: number | undefined;
}

export interface AssetFundAnnualReturn {
  year: number;
  value: number;
}

/** Statistiques de risque sur 3 ans glissants. */
export interface AssetFundRisk {
  volatility?: number | undefined;
  sharpe?: number | undefined;
  beta?: number | undefined;
  alpha?: number | undefined;
  rSquared?: number | undefined;
}
