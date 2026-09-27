import type { CurrencyCode, DisplayRangeKey, MarketSessionDto, MarketState, Quote, RangeKey } from "../market.js";
import type { FinancialYearItem } from "../assets.js";

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

export interface PortfolioDividendMonth {
  month: string;
  amount: number;
}

export interface PortfolioDividendEvent {
  symbol: string;
  name: string;
  date: string;
  year: number;
  amountPerShare: number;
  quantity: number;
  totalAmount: number;
  currency: CurrencyCode;
  status: "real" | "estimated";
  annualDividendRate?: number | undefined;
  dividendPercent?: number | undefined;
  yieldOnCostPercent?: number | undefined;
  stale?: boolean | undefined;
}

export interface PortfolioDividends {
  annualEstimatedTotal: number;
  currency: CurrencyCode;
  months: PortfolioDividendMonth[];
  upcoming: PortfolioDividendEvent[];
  past: PortfolioDividendEvent[];
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
  stale?: boolean;
  sectorExposureVersion?: number;
}

