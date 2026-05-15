import type { CurrencyCode, DisplayRangeKey, MarketSessionDto, MarketState, Quote, RangeKey } from "./market.js";
import type { FinancialYearItem, PeaEligibilityResult } from "./assets.js";

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
  baselinePrice?: number;
  baselineDatetime?: string;
  performanceEuro: number;
  performancePercent: number;
  marketState?: MarketState;
  marketSession?: MarketSessionDto;
  cachedAt: number;
  expiresAt: number;
  transactionMarkers: PortfolioTransactionMarker[];
  isPreparing?: boolean;
  missingRanges?: RangeKey[];
  missingAssets?: string[];
  jobId?: string;
}

export interface PortfolioTransactionMarker {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  logoUrl?: string;
  quantity: number;
  price?: number;
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
  notes?: string;
  createdAt: string;
}

export interface PositionWithMarket extends Position {
  quote?: Quote;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  performance: number;
  performancePercent: number;
  estimatedAnnualDividend?: number;
  marketDataUnavailable?: boolean;
}

export interface PositionTransactionStats {
  transactionCount: number;
  totalFees: number;
  totalDividendsReceived: number;
  currency: CurrencyCode;
}

export interface PositionMiniChart {
  range: RangeKey;
  points: Array<{
    t: number;
    v: number;
  }>;
  marketSession?: MarketSessionDto;
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
  annualDividendRate?: number;
  dividendPercent?: number;
  yieldOnCostPercent?: number;
  stale?: boolean;
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
  symbols: Array<{
    symbol: string;
    name: string;
    weight: number;
    logoUrl?: string;
  }>;
}

export interface PortfolioTreemapItem {
  symbol: string;
  name: string;
  value: number;
  percentage: number;
  logoUrl?: string;
  country?: string;
  sector?: string;
}

export interface NetMarginItem {
  symbol: string;
  name: string;
  netMargin: number;
  logoUrl?: string;
}

export interface AssetFinancials {
  symbol: string;
  name: string;
  logoUrl?: string;
  quoteType?: string;
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

export interface CreatePositionInput {
  symbol: string;
  name?: string;
  quantity: number;
  averageBuyPrice: number;
  currency: CurrencyCode;
}

export interface UpdatePositionInput {
  quantity: number;
  averageBuyPrice: number;
  currency: CurrencyCode;
  notes?: string;
}

export interface BoursoramaImportRow {
  line: number;
  name: string;
  isin: string;
  quantity: number;
  buyingPrice: number;
  lastPrice: number;
  intradayVariation: number;
  amount: number;
  amountVariation: number;
  variation: number;
  symbol: string | null;
  peaEligibility?: PeaEligibilityResult;
  detectedAsset?: {
    symbol: string;
    name: string;
    confidenceScore: number;
  };
  needsReview: boolean;
  errors: string[];
  existingPositionId?: number;
  action?: "replace" | "merge" | "ignore";
}

export interface BoursoramaUpdateRow extends BoursoramaImportRow {
  currentQuantity?: number;
  csvQuantity: number;
  quantityDiff: number;
  currentAverageBuyPrice?: number;
  csvAverageBuyPrice: number;
  proposedAction: "add" | "update" | "reduce" | "delete" | "unchanged" | "ignore";
  positionId?: number;
}

export type PortfolioTransactionSource = "csv" | "pdf_avis_opere" | "manual";
export type PortfolioTransactionType = "buy" | "sell" | "dividend" | "fee" | "unknown";

export interface PortfolioTransaction {
  id: string;
  assetId?: string;
  source: PortfolioTransactionSource;
  sourceFileName?: string;
  dateExecution?: string;
  valueDate?: string;
  assetName?: string;
  isin?: string;
  ticker?: string;
  type: PortfolioTransactionType;
  quantity: number;
  executedPrice?: number;
  totalFees?: number;
  currency: CurrencyCode;
  rawTextSnippet?: string;
  createdAt: string;
}

export interface EditablePortfolioTransaction extends PortfolioTransaction {
  positionId: number;
  price: number;
  tradedAt: string;
}

export interface ParsedAvisOperation {
  id: string;
  dateExecution?: string;
  nomValeur?: string;
  isin?: string;
  ticker?: string;
  quantite?: number | string;
  sensOperation: "achat" | "vente" | "inconnu";
  coursExecute?: number | string;
  montantTotalFrais?: number | string;
  devise: CurrencyCode;
  sourceFileName?: string;
  rawTextSnippet?: string;
  errors?: string[];
  warnings: string[];
  potentialDuplicate?: boolean;
  resolvedAsset?: {
    symbol: string;
    name: string;
    confidenceScore: number;
  };
  selectedSymbol?: string;
  selectedAssetName?: string;
  action?: "import" | "ignore";
}
