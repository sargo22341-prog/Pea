export type RangeKey = "1d" | "1w" | "1m" | "1y" | "ytd" | "max";
export type DashboardSortKey = "name" | "currentMarketValue" | "intervalPerformancePercent";
export type SortDirection = "asc" | "desc";
export type NewsLanguage = "fr" | "en";

export type CurrencyCode = "EUR" | "USD" | "GBP" | "CHF" | string;

export type PeaEligibilityStatus = "eligible" | "likely_eligible" | "not_eligible" | "unknown";

export type InstrumentKind = "stock" | "etf" | "fund" | "adr" | "reit" | "unknown";

export interface PeaEligibilityResult {
  symbol: string;
  normalizedSymbol: string;
  name?: string;
  currency?: string;
  exchange?: string;
  country?: string;
  quoteType?: string;
  kind: InstrumentKind;
  status: PeaEligibilityStatus;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  warnings: string[];
  source: "yahoo-finance2-plus-local-rules";
}

export interface PeaRankingResult {
  score: number;
  group: "pea_whitelist" | "likely_pea_stock" | "european_market" | "ucits_etf_unknown" | "unknown" | "us_market" | "not_eligible";
  reasons: string[];
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  quoteType?: string;
  currency?: CurrencyCode;
  peaEligibility?: PeaEligibilityResult;
  peaRank?: PeaRankingResult;
  stale?: boolean;
}

export interface EnrichedSearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  quoteType?: string;
  currency?: CurrencyCode;
  price?: number;
  regularMarketChangePercent?: number;
  isInWatchlist: boolean;
  isInPortfolio: boolean;
}

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  currency: CurrencyCode;
  exchange?: string;
  quoteType?: string;
  marketState?: string;
  dividendRate?: number;
  dividendYield?: number;
  logoUrl?: string;
  stale?: boolean;
  unavailable?: boolean;
}

export interface AssetMarketInfo {
  marketState?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  exchangeName?: string;
  currency?: CurrencyCode;
  regularMarketVolume?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  averageDailyVolume3Month?: number;
  totalAssets?: number;
  dividendRate?: number;
  dividendYield?: number;
  exDividendDate?: string;
}

export interface HistoryPoint {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
  stale?: boolean;
}

export interface DividendEvent {
  symbol: string;
  date: string;
  amount: number;
  currency: CurrencyCode;
  status: "real" | "estimated";
  stale?: boolean;
}

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  publisher?: string;
  publishedAt?: string;
  relatedTickers?: string[];
  relatedAssets?: Array<{
    symbol: string;
    name: string;
  }>;
}

export interface NewsFeedPage {
  articles: NewsArticle[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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
}

export interface WatchlistItem {
  id: number;
  symbol: string;
  name: string;
  exchange?: string;
  currency?: CurrencyCode;
  createdAt: string;
  quote?: Quote;
  history: HistoryPoint[];
  marketDataUnavailable?: boolean;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalPerformance: number;
  totalPerformancePercent: number;
  positionsCount: number;
  assetsCount: number;
  currency: CurrencyCode;
  positions: PositionWithMarket[];
}

export interface PortfolioPerformancePoint {
  date: string;
  value: number;
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

export interface FinancialYearItem {
  year: number;
  revenue: number;
  netIncome: number;
  netMargin: number;
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

export interface AssetDetails {
  quote: Quote;
  history: HistoryPoint[];
  dividends: DividendEvent[];
  news: NewsArticle[];
  position?: PositionWithMarket;
  positionStats?: PositionTransactionStats;
  isInWatchlist?: boolean;
  summary: Record<string, string | number | undefined>;
  marketInfo?: AssetMarketInfo;
  financials?: FinancialYearItem[];
  isEtf?: boolean;
  peaEligibility: PeaEligibilityResult;
  peaRank: PeaRankingResult;
  stale?: boolean;
}

export interface AssetIcon {
  symbol: string;
  filePath?: string;
  mimeType?: string;
  size?: number;
  source: "manual" | "auto";
  fetchStatus: "success" | "failed" | "pending";
  lastAttemptAt?: string;
  updatedAt?: string;
  hasIcon?: boolean;
}

export interface User {
  id: number;
  username: string;
  profileIconUrl?: string;
  hasProfileIcon?: boolean;
  dashboardDefaultSortKey: DashboardSortKey;
  dashboardDefaultSortDirection: SortDirection;
  defaultChartRange: RangeKey;
  localPeaSearchEnabled: boolean;
  assetNewsEnabled: boolean;
  newsLanguages: NewsLanguage[];
  createdAt: string;
}

export interface AuthMe {
  user: User | null;
  setupRequired: boolean;
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
  grossAmount?: number;
  commission?: number;
  fees?: number;
  totalFees?: number;
  netAmount?: number;
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
  quantite?: number;
  sensOperation: "achat" | "vente" | "inconnu";
  coursExecute?: number;
  montantBrut?: number;
  commission?: number;
  frais?: number;
  montantTotalFrais?: number;
  montantNet?: number;
  devise: CurrencyCode;
  sourceFileName?: string;
  rawTextSnippet?: string;
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
