export interface RuntimeHealthDto {
  generatedAt: string;
  cache: {
    cacheEntries: {
      totalRows: number;
      expiredRows: number;
      byScope: { scope: string; rows: number; expiredRows: number }[];
    };
    derivedCaches: {
      portfolioChartCacheRows: number;
      portfolioPositionsPerformanceCacheRows: number;
      frontendBlockCacheRows: number;
    };
    cleanup: {
      lastRunAt?: string;
      durationMs?: number;
      deletedRows?: Record<string, number> | undefined;
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
    oldestPendingAgeMs?: number | undefined;
    oldestRunningAgeMs?: number | undefined;
    activeWorkers: number;
    maxConcurrentTasks: number;
    busySymbols: number;
    byTypePriority: { type: string; priority: number; pending: number; running: number; failed: number; completed: number }[];
  };
  scheduler: {
    lastTickAt?: string|null | undefined;
    lastTickDurationMs?: number | undefined;
    lastSuccessAt?: string|null | undefined;
    lastError?: string|null | undefined;
    lockOwner?: string|null | undefined;
    heartbeatAgeMs?: number | undefined;
    trackedMarkets: number;
    nextTickAt?: string|null | undefined;
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
  regularMarketPrice?: number | undefined;
  regularMarketTime?: string | undefined;
  previousClose?: number | undefined;
  openPrice?: number | undefined;
  dayHigh?: number | undefined;
  dayLow?: number | undefined;
  dayChange?: number | undefined;
  dayChangePercent?: number | undefined;
  volume?: number | undefined;
  avgVolume3M?: number | undefined;
  avgVolume10D?: number | undefined;
  bid?: number | undefined;
  ask?: number | undefined;
  currency?: CurrencyCode | undefined;
  exchangeName?: string | undefined;
  quoteType?: string | undefined;
  week52Low?: number | undefined;
  week52High?: number | undefined;
  dividendYield?: number | undefined;
  annualDividend?: number | undefined;
  exDividendDate?: string | undefined;
  revenue?: number;
  netIncome?: number;
  netMargin?: number;
  freshness?: {
    marketCoreUpdatedAt?: string | undefined;
    liquidityUpdatedAt?: string | undefined;
    range52wUpdatedAt?: string | undefined;
    dividendInfoUpdatedAt?: string | undefined;
    marketProfileUpdatedAt?: string | undefined;
  };
  cachedAt: number;
  expiresAt: number;
}

export interface AssetDividendsDto {
  symbol: string;
  totalDividends?: number;
  annualDividend?: number | undefined;
  dividendYield?: number | undefined;
  exDate?: string | undefined;
  history: {
    date: string;
    amount: number;
  }[];
  cachedAt: number;
  expiresAt: number;
}

export interface AssetArticlesDto {
  symbol: string;
  articles: {
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    imageUrl?: string | undefined;
    summary?: string;
  }[];
  cachedAt: number;
  expiresAt: number;
}

export interface HistoryPoint {
  date: string;
  open?: number | undefined;
  high?: number | undefined;
  low?: number | undefined;
  close: number;
  volume?: number | undefined;
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
  imageUrl?: string | undefined;
  publisher?: string | undefined;
  publishedAt?: string | undefined;
  relatedTickers?: string[];
  relatedAssets?: {
    symbol: string;
    name: string;
  }[];
  /**
   * Actifs liés dont une publication de résultats tombe à un jour près de la date de l'article
   * (jours civils du fuseau de l'application). Renseigné par le fil « Mes actifs ».
   */
  earningsSymbols?: string[];
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
