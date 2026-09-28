import type { CurrencyCode, DisplayRangeKey, MarketSessionDto, MarketState, Quote, RangeKey } from "../market.js";
import type { FinancialYearItem } from "../fundamentals.js";
import type { DividendSustainabilityItem, LookThroughSource, PortfolioCorrelation, PortfolioLookThrough, PortfolioValuation } from "./analysis.js";

export interface UserAssetPositionDto {
  userId: string;
  symbol: string;
  quantity: number;
  averagePrice: number;
  transactionCount: number;
  totalFees: number;
  investedAmount: number;
}

export interface PortfolioChartDto {
  userId: string;
  range: DisplayRangeKey;
  timestamps: number[];
  value: number[];
  invested: number[];
  gain: number[];
  gainPercent: number[];
  baselinePrice?: number | undefined;
  baselineDatetime?: string | undefined;
  performanceEuro: number;
  performancePercent: number;
  marketState?: MarketState | undefined;
  marketSession?: MarketSessionDto | undefined;
  cachedAt: number;
  expiresAt: number;
  transactionMarkers: PortfolioTransactionMarker[];
  isPreparing?: boolean | undefined;
  missingRanges?: RangeKey[] | undefined;
  missingAssets?: string[] | undefined;
  jobId?: string | undefined;
}

export interface PortfolioTransactionMarker {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  logoUrl?: string;
  quantity: number;
  price?: number | undefined;
  transactionDate: string;
  type: "buy" | "sell";
  nearestChartPointDatetime: number;
}

export interface Position {
  id: number;
  symbol: string;
  name: string;
  quantity: number;
  averageBuyPrice: number;
  currency: CurrencyCode;
  notes?: string | undefined;
  createdAt: string;
}

export interface PositionWithMarket extends Position {
  quote?: Quote | undefined;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  performance: number;
  performancePercent: number;
  estimatedAnnualDividend?: number | undefined;
  marketDataUnavailable?: boolean | undefined;
  /** Dividende annuel rapporté au prix de revient unitaire (fraction). */
  yieldOnCost?: number | undefined;
  fiftyTwoWeekLow?: number | undefined;
  fiftyTwoWeekHigh?: number | undefined;
  /** Changement récent de la recommandation consensuelle des analystes. */
  consensusChange?: PositionConsensusChange | undefined;
}

export interface PositionConsensusChange {
  from: string;
  to: string;
  changedAt: string;
}

export interface PositionTransactionStats {
  transactionCount: number;
  totalFees: number;
  totalDividendsReceived: number;
  currency: CurrencyCode;
}

export interface PositionMiniChart {
  range: RangeKey;
  points: {
    t: number;
    v: number;
  }[];
  marketSession?: MarketSessionDto | undefined;
  stale?: boolean;
  updatedAt?: string;
}

export interface PositionRangePerformance extends Position {
  currentPrice: number;
  currentMarketValue: number;
  intervalStartPrice: number;
  intervalStartMarketValue: number;
  intervalPerformanceValue: number;
  intervalPerformancePercent: number;
  totalPerformanceValue: number;
  totalPerformancePercent: number;
  currency: CurrencyCode;
  stale?: boolean;
  incompleteData?: boolean;
  miniChart: PositionMiniChart;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalDividendsReceived: number;
  totalFees: number;
  totalPerformance: number;
  totalPerformancePercent: number;
  positionsCount: number;
  assetsCount: number;
  currency: CurrencyCode;
  positions: PositionWithMarket[];
  /** Dividendes annuels attendus rapportés au coût total du portefeuille (fraction). */
  yieldOnCost?: number | undefined;
}

export interface PortfolioFullDto {
  summary: PortfolioSummary;
  chart: PortfolioChartDto;
}

export interface PortfolioPerformancePoint {
  date: string;
  value: number;
  invested?: number;
  gain?: number;
  gainPercent?: number;
  stale?: boolean;
}

export interface AllocationChartItem {
  name: string;
  value: number;
  percentage: number;
  symbols: {
    symbol: string;
    name: string;
    weight: number;
    logoUrl?: string | undefined;
  }[];
}

export interface PortfolioTreemapItem {
  symbol: string;
  name: string;
  value: number;
  percentage: number;
  logoUrl?: string | undefined;
  country?: string;
  sector?: string;
  /** Vue « Direct + via ETF » : part de la ligne détenue à travers chaque ETF. */
  viaEtf?: LookThroughSource[] | undefined;
}

export interface NetMarginItem {
  symbol: string;
  name: string;
  netMargin: number;
  logoUrl?: string | undefined;
}

export interface AssetFinancials {
  symbol: string;
  name: string;
  logoUrl?: string | undefined;
  quoteType?: string | undefined;
  isEtf: boolean;
  financials: FinancialYearItem[];
}

export interface PortfolioAnalysis {
  countryAllocation: AllocationChartItem[];
  sectorAllocation: AllocationChartItem[];
  treemap: PortfolioTreemapItem[];
  netMargins: NetMarginItem[];
  financials: FinancialYearItem[];
  financialsByAsset: AssetFinancials[];
  /** Tranches `CapitalizationBucket` (large, mid, small, etf, unknown) en guise de `name`. */
  capitalizationAllocation: AllocationChartItem[];
  /** Devise de cotation de chaque ligne. */
  currencyAllocation: AllocationChartItem[];
  valuation: PortfolioValuation;
  lookThrough: PortfolioLookThrough;
  dividendSustainability: DividendSustainabilityItem[];
  correlation?: PortfolioCorrelation | undefined;
  stale?: boolean;
  /** Version du calcul : un résultat mis en cache par une version antérieure est recalculé. */
  payloadVersion?: number;
}

