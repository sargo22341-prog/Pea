export type RangeKey = "1d" | "1w" | "1m" | "1y" | "ytd" | "max";

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
  peaEligibility: PeaEligibilityResult;
  peaRank?: PeaRankingResult;
  stale?: boolean;
}

export interface EnrichedSearchResult extends SearchResult {
  price?: number;
  regularMarketChangePercent?: number;
  isInWatchlist: boolean;
  isInPortfolio: boolean;
  history: HistoryPoint[];
  marketDataUnavailable?: boolean;
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

export interface Position {
  id: number;
  symbol: string;
  name: string;
  quantity: number;
  averageBuyPrice: number;
  currency: CurrencyCode;
  purchaseDate?: string;
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

export interface CreatePositionInput {
  symbol: string;
  name?: string;
  quantity: number;
  averageBuyPrice: number;
  currency: CurrencyCode;
  purchaseDate?: string;
}

export interface UpdatePositionInput {
  quantity: number;
  averageBuyPrice: number;
  currency: CurrencyCode;
  purchaseDate?: string;
  notes?: string;
}

export interface AssetDetails {
  quote: Quote;
  history: HistoryPoint[];
  dividends: DividendEvent[];
  position?: PositionWithMarket;
  summary: Record<string, string | number | undefined>;
  peaEligibility: PeaEligibilityResult;
  peaRank: PeaRankingResult;
  stale?: boolean;
}
