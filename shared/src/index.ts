/**
 * Rôle du fichier : centraliser les contrats TypeScript partagés entre le backend
 * et le frontend afin que les DTO renvoyés par l'API restent cohérents.
 */

export type RangeKey = "1d" | "1w" | "1m" | "1y" | "5y" | "10y" | "ytd" | "all";
export type DisplayRangeKey = "intraday" | "1W" | "1M" | "YTD" | "1Y" | "5Y" | "10Y" | "ALL";
export type MarketState = "OPEN" | "CLOSED" | "PRE" | "POST";
export type DashboardSortKey = "name" | "currentMarketValue" | "intervalPerformancePercent";
export type WatchlistSortKey = "name" | "price" | "performancePercent";
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

/** Ligne legere renvoyee pour les classements Yahoo Finance du jour. */
export interface TopMover {
  symbol: string;
  shortName?: string;
  price: number;
  changePercent: number;
  change: number;
  currency?: CurrencyCode;
}

/** Reponse cachee par jour calendaire pour les top gainers et top losers. */
export interface TopAndLosersResponse {
  gainers: TopMover[];
  losers: TopMover[];
  cachedAt: string;
  cacheDate: string;
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

export interface AssetStaticDto {
  symbol: string;
  name: string;
  type: "stock" | "etf";
  currency: string;
  exchange: string;
  country?: string;
  sector?: string;
}

export interface UserAssetPositionDto {
  userId: string;
  symbol: string;
  quantity: number;
  averagePrice: number;
  transactionCount: number;
  totalFees: number;
  investedAmount: number;
}

export interface AssetChartDto {
  symbol: string;
  range: DisplayRangeKey;
  interval: string;
  timestamps: number[];
  prices: number[];
  baselinePrice?: number;
  baselineDatetime?: string;
  performance?: number[];
  performanceEuro?: number;
  performancePercent?: number;
  marketState?: MarketState;
  marketSession?: MarketSessionDto;
  cachedAt: number;
  expiresAt: number;
  isPreparing?: boolean;
  missingRanges?: RangeKey[];
  missingAssets?: string[];
  jobId?: string;
}

export interface MarketSessionDto {
  timezone: string;
  city: string;
  open: string;
  close: string;
  sessions: { open: string; close: string }[];
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

export interface DataConstructionJobDto {
  id: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  status: "idle" | "queued" | "running" | "success" | "error";
  progressPercent: number;
  currentMessage: string;
  currentTaskLabel?: string;
  errors: string[];
  createdAt: string;
  updatedAt: string;
}

export type MarketOpenRunStatus =
  | "pending"
  | "checking"
  | "confirmed_open"
  | "confirmed_open_partial"
  | "holiday_suspected"
  | "missed_open_window"
  | "failed"
  | "skipped_weekend"
  | "skipped_no_assets";

export type MarketCloseRunStatus =
  | "pending"
  | "checking"
  | "confirmed_closed"
  | "confirmed_closed_partial"
  | "close_not_confirmed"
  | "failed"
  | "skipped_weekend"
  | "skipped_no_assets";

export interface TrackedMarketDto {
  marketKey: string;
  displayName: string;
  timezone: string;
  tradingDate: string;
  assetsCount: number;
  enabled: boolean;
  openExpectedAt?: string | null;
  openConfirmedAt?: string | null;
  openLastCheckedAt?: string | null;
  nextOpenCheckAt?: string | null;
  openStatus: MarketOpenRunStatus;
  openMessage?: string | null;
  openAttempts: number;
  closeExpectedAt?: string | null;
  closeConfirmedAt?: string | null;
  closeLastCheckedAt?: string | null;
  nextCloseCheckAt?: string | null;
  closeStatus: MarketCloseRunStatus;
  closeMessage?: string | null;
  closeAttempts: number;
}

export interface SchedulerHealthDto {
  scheduler_name: string;
  last_tick_at?: string | null;
  last_successful_tick_at?: string | null;
  last_error?: string | null;
  updated_at: string;
}

export interface TrackedMarketsSettingsDto {
  nextTask: {
    type: "open" | "close";
    marketKey: string;
    marketName: string;
    marketTimezone: string;
    runAt: string;
  } | null;
  markets: TrackedMarketDto[];
  health: SchedulerHealthDto;
}

export interface AssetMarketDto {
  symbol: string;
  marketState: MarketState;
  dayChange: number;
  dayChangePercent: number;
  volume: number;
  avgVolume3M?: number;
  week52Low?: number;
  week52High?: number;
  dividendYield?: number;
  annualDividend?: number;
  exDividendDate?: string;
  revenue?: number;
  netIncome?: number;
  netMargin?: number;
  cachedAt: number;
  expiresAt: number;
}

export interface AssetDividendsDto {
  symbol: string;
  totalDividends?: number;
  annualDividend?: number;
  dividendYield?: number;
  exDate?: string;
  history: Array<{
    date: string;
    amount: number;
  }>;
  cachedAt: number;
  expiresAt: number;
}

export interface AssetArticlesDto {
  symbol: string;
  articles: Array<{
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    imageUrl?: string;
    summary?: string;
  }>;
  cachedAt: number;
  expiresAt: number;
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

export interface NewsAssetsPage {
  articles: NewsArticle[];
  limit: number;
  offset: number;
  totalAssets: number;
  queriedAssets: number;
  hasMore: boolean;
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
  totalDividendsReceived: number;
  totalFees: number;
  totalPerformance: number;
  totalPerformancePercent: number;
  positionsCount: number;
  assetsCount: number;
  currency: CurrencyCode;
  positions: PositionWithMarket[];
}

/** Réponse unifiée pour le dashboard : summary + chart en un seul aller-retour réseau. */
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

export type CalendarEventType = "earnings" | "earnings_call" | "ex_dividend" | "dividend";

export interface CalendarEvent {
  id: number;
  symbol: string;
  eventType: CalendarEventType;
  eventDate: string;
  isEstimate: boolean;
  assetName: string;
}

export interface AssetCalendarEventsData {
  earningsDate?: string;
  earningsCallDate?: string;
  isEarningsDateEstimate?: boolean;
  exDividendDate?: string;
  dividendDate?: string;
}

export interface AssetAnalystConsensus {
  currentPrice?: number;
  targetHighPrice?: number;
  targetLowPrice?: number;
  targetMeanPrice?: number;
  targetMedianPrice?: number;
  recommendationMean?: number;
  recommendationKey?: string;
  numberOfAnalystOpinions?: number;
}

export interface AssetFundDetails {
  family?: string;
  annualReportExpenseRatio?: number;
  annualHoldingsTurnover?: number;
  totalNetAssets?: number;
  sectorWeightings?: Array<{ key: string; value: number }>;
}

export interface AssetDetails {
  quote: Quote;
  history: HistoryPoint[];
  chart?: AssetChartDto;
  dividends: DividendEvent[];
  dividendsDto?: AssetDividendsDto;
  news: NewsArticle[];
  articlesDto?: AssetArticlesDto;
  position?: PositionWithMarket;
  userAssetPosition?: UserAssetPositionDto;
  positionStats?: PositionTransactionStats;
  isInWatchlist?: boolean;
  summary: Record<string, string | number | undefined>;
  marketInfo?: AssetMarketInfo;
  market?: AssetMarketDto;
  appTimezone?: string;
  marketSession?: MarketSessionDto;
  financials?: FinancialYearItem[];
  isEtf?: boolean;
  peaEligibility: PeaEligibilityResult;
  peaRank: PeaRankingResult;
  stale?: boolean;
  calendarEventsData?: AssetCalendarEventsData;
  analystConsensus?: AssetAnalystConsensus;
  fundDetails?: AssetFundDetails;
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
  role: "admin" | "user";
  profileIconUrl?: string;
  hasProfileIcon?: boolean;
  dashboardDefaultSortKey: DashboardSortKey;
  dashboardDefaultSortDirection: SortDirection;
  watchlistDefaultSortKey: WatchlistSortKey;
  watchlistDefaultSortDirection: SortDirection;
  defaultChartRange: RangeKey;
  localPeaSearchEnabled: boolean;
  assetNewsEnabled: boolean;
  newsLanguages: NewsLanguage[];
  /** Quand vrai, les chiffres liés au portefeuille de l'utilisateur sont remplacés par des étoiles. */
  privacyModeEnabled: boolean;
  createdAt: string;
}

export interface AuthMe {
  user: User | null;
  setupRequired: boolean;
  appTimezone: string;
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
