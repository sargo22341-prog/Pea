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
import type {
  AssetAnalystConsensus,
  AssetAnalystTrend,
  AssetCalendarEventsData,
  AssetEarnings,
  AssetFinancialHealth,
  AssetFundDetails,
  AssetValuation,
  FinancialYearItem
} from "./fundamentals.js";
import type { PositionRangePerformance, PositionTransactionStats, PositionWithMarket, UserAssetPositionDto } from "./portfolio.js";

export type PeaEligibilityStatus = "eligible" | "likely_eligible" | "not_eligible" | "unknown";
export type InstrumentKind = "stock" | "etf" | "fund" | "adr" | "reit" | "unknown";

export interface PeaEligibilityResult {
  symbol: string;
  normalizedSymbol: string;
  name?: string;
  currency?: string;
  exchange?: string;
  country?: string | undefined;
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
  exchange?: string | undefined;
  quoteType?: string;
  currency?: CurrencyCode | undefined;
  peaEligibility?: PeaEligibilityResult;
  peaRank?: PeaRankingResult;
  stale?: boolean;
}

export interface EnrichedSearchResult {
  symbol: string;
  name: string;
  exchange?: string | undefined;
  quoteType?: string | undefined;
  currency?: CurrencyCode | undefined;
  price?: number | undefined;
  regularMarketChangePercent?: number | undefined;
  isInWatchlist: boolean;
  isInPortfolio: boolean;
}

export interface AssetStaticDto {
  symbol: string;
  name: string;
  type: "stock" | "etf";
  currency: string;
  exchange: string;
  country?: string | undefined;
  sector?: string | undefined;
}

export interface WatchlistItem {
  id: number;
  symbol: string;
  name: string;
  exchange?: string | undefined;
  currency?: CurrencyCode | undefined;
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
  currency?: string | undefined;
  /** Consensus de la prochaine publication de résultats. */
  epsAverage?: number | undefined;
  revenueAverage?: number | undefined;
}

export interface AssetDetails {
  quote: Quote;
  history: HistoryPoint[];
  chart?: AssetChartDto;
  dividends: DividendEvent[];
  dividendsDto?: AssetDividendsDto | undefined;
  news: NewsArticle[];
  articlesDto?: AssetArticlesDto | undefined;
  position?: PositionWithMarket | undefined;
  positionRangePerformance?: PositionRangePerformance | undefined;
  userAssetPosition?: UserAssetPositionDto | undefined;
  positionStats?: PositionTransactionStats | undefined;
  isInWatchlist?: boolean;
  summary: Record<string, string | number | undefined>;
  marketInfo?: AssetMarketInfo;
  market?: AssetMarketDto;
  appTimezone?: string;
  marketSession?: MarketSessionDto | undefined;
  financials?: FinancialYearItem[] | undefined;
  isEtf?: boolean;
  peaEligibility: PeaEligibilityResult;
  peaRank: PeaRankingResult;
  stale?: boolean;
  calendarEventsData?: AssetCalendarEventsData | undefined;
  analystConsensus?: AssetAnalystConsensus | undefined;
  fundDetails?: AssetFundDetails | undefined;
  valuation?: AssetValuation | undefined;
  financialHealth?: AssetFinancialHealth | undefined;
  analystTrend?: AssetAnalystTrend | undefined;
  earnings?: AssetEarnings | undefined;
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
