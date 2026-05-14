export type RangeKey = "1d" | "1w" | "1m" | "1y" | "5y" | "10y" | "ytd" | "all";
export type DisplayRangeKey = "intraday" | "1W" | "1M" | "YTD" | "1Y" | "5Y" | "10Y" | "ALL";
export type MarketState = "OPEN" | "CLOSED" | "PRE" | "POST";
export type CurrencyCode = "EUR" | "USD" | "GBP" | "CHF" | string;

export interface TopMover {
  symbol: string;
  shortName?: string;
  price: number;
  changePercent: number;
  change: number;
  currency?: CurrencyCode;
}

export interface TopAndLosersResponse {
  gainers: TopMover[];
  losers: TopMover[];
  cachedAt: string;
  cacheDate: string;
}

export type MarketListId =
  | "day_gainers"
  | "day_losers"
  | "trending_fr"
  | "high_dividend_yield"
  | "top_etfs_us"
  | "undervalued_large_caps"
  | "undervalued_growth_stocks";

export interface MarketListResponse {
  id: MarketListId;
  items: TopMover[];
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
  regularMarketTime?: string;
  regularMarketPreviousClose?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  exchangeName?: string;
  currency?: CurrencyCode;
  regularMarketVolume?: number;
  bid?: number;
  ask?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  averageDailyVolume3Month?: number;
  totalAssets?: number;
  dividendRate?: number;
  dividendYield?: number;
  exDividendDate?: string;
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
  availabilityStatus?: "pending_open_confirmation" | "unavailable";
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

export interface YahooUsageSummaryDto {
  totalCalls: number;
  callsToday: number;
  calls24h: number;
  calls7d: number;
  errorCalls: number;
  errorRate: number;
  avgDurationMs: number;
}

export interface YahooUsageBucketDto {
  key: string;
  calls: number;
  errors?: number;
  avgDurationMs?: number;
}

export interface YahooUsageRecentErrorDto {
  id: number;
  createdAt: string;
  method: string;
  ticker?: string;
  tickers: string[];
  modules: string[];
  errorMessage?: string;
  internalSource?: string;
  durationMs: number;
}

export interface YahooUsageCallDto extends YahooUsageRecentErrorDto {
  success: boolean;
  tickerCount: number;
  range?: string;
  interval?: string;
  cacheHit: boolean;
  requestKey?: string;
}

export interface YahooUsageStatsDto {
  summary: YahooUsageSummaryDto;
  callsByHour: YahooUsageBucketDto[];
  callsByDay: YahooUsageBucketDto[];
  byMethod: YahooUsageBucketDto[];
  bySource: YahooUsageBucketDto[];
  topTickers: YahooUsageBucketDto[];
  topModules: YahooUsageBucketDto[];
  recentErrors: YahooUsageRecentErrorDto[];
}

export interface RuntimeHealthDto {
  generatedAt: string;
  cache: {
    cacheEntries: {
      totalRows: number;
      expiredRows: number;
      byScope: Array<{ scope: string; rows: number; expiredRows: number }>;
    };
    derivedCaches: {
      portfolioChartCacheRows: number;
      portfolioPositionsPerformanceCacheRows: number;
      frontendBlockCacheRows: number;
    };
    cleanup: {
      lastRunAt?: string;
      durationMs?: number;
      deletedRows?: Record<string, number>;
      totalDeletedRows?: number;
      lastError?: string;
      lastErrorAt?: string;
    };
  };
  memory: {
    intradayChartCacheEntries: number;
    intradayRefreshInFlight: number;
    snapshotQuoteCacheEntries: number;
    previousOpenMarketDaysCacheEntries: number;
    backendInFlightRequests: number;
    yahooSearchCacheEntries: number;
    yahooQuoteCombineCacheEntries: number;
    rateLimitBuckets: number;
    authFailureEntries: number;
    sseClients: number;
  };
  queue: {
    pending: number;
    running: number;
    failed: number;
    completed: number;
    oldestPendingAgeMs?: number;
    oldestRunningAgeMs?: number;
    activeWorkers: number;
    maxConcurrentTasks: number;
    busySymbols: number;
    byTypePriority: Array<{ type: string; priority: number; pending: number; running: number; failed: number; completed: number }>;
  };
  scheduler: {
    lastTickAt?: string | null;
    lastTickDurationMs?: number;
    lastSuccessAt?: string | null;
    lastError?: string | null;
    lockOwner?: string | null;
    heartbeatAgeMs?: number;
    trackedMarkets: number;
    nextTickAt?: string | null;
    running: boolean;
    status: "healthy" | "warning" | "error";
  };
  yahoo: {
    circuitBreaker: {
      state: "closed" | "open" | "half-open";
      failureCount: number;
      openedAt?: string | null;
      nextAttemptAt?: string | null;
    };
    recentCalls24h: number;
    recentErrors: YahooUsageRecentErrorDto[];
    backendInFlightRequests: number;
    searchCacheEntries: number;
    quoteCombineCacheEntries: number;
  };
}

export interface AssetMarketDto {
  symbol: string;
  marketState: MarketState;
  regularMarketPrice?: number;
  regularMarketTime?: string;
  previousClose?: number;
  openPrice?: number;
  dayHigh?: number;
  dayLow?: number;
  dayChange?: number;
  dayChangePercent?: number;
  volume?: number;
  avgVolume3M?: number;
  avgVolume10D?: number;
  bid?: number;
  ask?: number;
  currency?: CurrencyCode;
  exchangeName?: string;
  quoteType?: string;
  week52Low?: number;
  week52High?: number;
  dividendYield?: number;
  annualDividend?: number;
  exDividendDate?: string;
  revenue?: number;
  netIncome?: number;
  netMargin?: number;
  freshness?: {
    marketCoreUpdatedAt?: string;
    liquidityUpdatedAt?: string;
    range52wUpdatedAt?: string;
    dividendInfoUpdatedAt?: string;
    marketProfileUpdatedAt?: string;
  };
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

/**
 * Types des événements SSE émis par le backend (`/api/market-events`) et consommés par le
 * frontend. Ce contrat est partagé pour empêcher toute divergence entre les deux côtés.
 */
export type MarketEventType =
  | "market-snapshot-updated"
  | "portfolio-market-updated"
  | "watchlist-market-updated"
  | "portfolio-assets-updated"
  | "watchlist-assets-updated"
  | "portfolio-chart-refresh-started"
  | "asset-chart-refresh-started"
  | "watchlist-chart-refresh-started"
  | "portfolio-performance-refresh-started"
  | "portfolio-chart-updated"
  | "asset-chart-updated"
  | "watchlist-chart-updated"
  | "portfolio-performance-updated"
  | "dashboard-chart-updated"
  | "analysis-updated"
  | "dividends-updated"
  | "scheduler-health-updated";

export interface MarketEventPayload {
  type: MarketEventType;
  markets?: string[];
  symbols?: string[];
  symbol?: string;
  range?: string;
  updatedAt?: string;
  startedAt?: string;
}

export const MARKET_EVENT_TYPES: readonly MarketEventType[] = [
  "market-snapshot-updated",
  "portfolio-market-updated",
  "watchlist-market-updated",
  "portfolio-assets-updated",
  "watchlist-assets-updated",
  "portfolio-chart-refresh-started",
  "asset-chart-refresh-started",
  "watchlist-chart-refresh-started",
  "portfolio-performance-refresh-started",
  "portfolio-chart-updated",
  "asset-chart-updated",
  "watchlist-chart-updated",
  "portfolio-performance-updated",
  "dashboard-chart-updated",
  "analysis-updated",
  "dividends-updated",
  "scheduler-health-updated"
] as const;
