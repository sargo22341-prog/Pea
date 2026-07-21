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
import type { CurrencyCode, MarketState, YahooUsageRecentErrorDto } from "./core.js";
