import type {
  AssetArticlesDto,
  AssetChartDto,
  AssetDividendsDto,
  AssetMarketDto,
  AssetMarketInfo,
  CurrencyCode,
  DividendEvent,
  HistoryPoint,
  MarketSessionDto,
  NewsArticle,
  Quote
} from "./market.js";
import type { PositionRangePerformance, PositionTransactionStats, PositionWithMarket, UserAssetPositionDto } from "./portfolio.js";

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

export interface AssetStaticDto {
  symbol: string;
  name: string;
  type: "stock" | "etf";
  currency: string;
  exchange: string;
  country?: string;
  sector?: string;
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
  positionRangePerformance?: PositionRangePerformance;
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

export interface FinancialYearItem {
  year: number;
  revenue: number;
  netIncome: number;
  netMargin: number;
}
