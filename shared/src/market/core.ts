export type RangeKey = "1d" | "1w" | "1m" | "1y" | "5y" | "10y" | "ytd" | "all";
export type DisplayRangeKey = "intraday" | "1W" | "1M" | "YTD" | "1Y" | "5Y" | "10Y" | "ALL";
export type MarketState = "OPEN" | "CLOSED" | "PRE" | "POST";
/** Code devise ISO 4217 (EUR, USD, GBP, CHF...) ; toute devise renvoyee par Yahoo est acceptee. */
export type CurrencyCode = string;

export interface TopMover {
  symbol: string;
  shortName?: string;
  price: number;
  changePercent: number;
  change: number;
  currency?: CurrencyCode | undefined;
  exchange?: string | undefined;
  quoteType?: string | undefined;
  /** PER sur 12 mois glissants. */
  trailingPE?: number | undefined;
  /** Rendement du dividende sur 12 mois glissants (fraction). */
  dividendYield?: number | undefined;
  marketCap?: number | undefined;
  /** Éligibilité PEA probable selon les règles locales (`peaEligibility.ts`). */
  peaEligible?: boolean | undefined;
}

/** Listes Yahoo Finance proposées ; les trois premières sont visibles d'emblée sur la page Marchés. */
export const MARKET_LIST_IDS = [
  "day_gainers",
  "day_losers",
  "trending_fr",
  "high_dividend_yield",
  "top_etfs_us",
  "undervalued_large_caps",
  "undervalued_growth_stocks",
  "growth_technology_stocks",
  "aggressive_small_caps",
  "small_cap_gainers",
  "top_mutual_funds",
  "conservative_foreign_funds",
  "high_yield_bond"
] as const;
export type MarketListId = (typeof MARKET_LIST_IDS)[number];

export interface MarketListResponse {
  id: MarketListId;
  items: TopMover[];
  cachedAt: string;
  cacheDate: string;
  /** Vrai quand seuls les titres probablement éligibles au PEA sont conservés. */
  peaOnly?: boolean | undefined;
}

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  previousClose?: number | undefined;
  change?: number | undefined;
  changePercent?: number | undefined;
  currency: CurrencyCode;
  exchange?: string | undefined;
  quoteType?: string | undefined;
  marketState?: string | undefined;
  dividendRate?: number | undefined;
  dividendYield?: number | undefined;
  logoUrl?: string | undefined;
  stale?: boolean;
  unavailable?: boolean;
}

export interface AssetMarketInfo {
  marketState?: string | undefined;
  regularMarketPrice?: number | undefined;
  regularMarketChange?: number | undefined;
  regularMarketChangePercent?: number | undefined;
  regularMarketTime?: string | undefined;
  regularMarketPreviousClose?: number | undefined;
  regularMarketOpen?: number | undefined;
  regularMarketDayHigh?: number | undefined;
  regularMarketDayLow?: number | undefined;
  exchangeName?: string | undefined;
  currency?: CurrencyCode | undefined;
  regularMarketVolume?: number | undefined;
  bid?: number | undefined;
  ask?: number | undefined;
  fiftyTwoWeekLow?: number | undefined;
  fiftyTwoWeekHigh?: number | undefined;
  averageDailyVolume3Month?: number | undefined;
  totalAssets?: number | undefined;
  dividendRate?: number | undefined;
  dividendYield?: number | undefined;
  /** Part du bénéfice distribuée en dividendes (fraction), `summaryDetail.payoutRatio`. */
  payoutRatio?: number | undefined;
  exDividendDate?: string | undefined;
}

export interface AssetChartDto {
  symbol: string;
  range: DisplayRangeKey;
  interval: string;
  timestamps: number[];
  prices: number[];
  baselinePrice?: number;
  baselineDatetime?: string;
  performance?: number[] | undefined;
  performanceEuro?: number;
  performancePercent?: number;
  marketState?: MarketState;
  marketSession?: MarketSessionDto | undefined;
  cachedAt: number;
  expiresAt: number;
  isPreparing?: boolean;
  availabilityStatus?: "pending_open_confirmation" | "unavailable" | undefined;
  missingRanges?: RangeKey[] | undefined;
  missingAssets?: string[] | undefined;
  jobId?: string | undefined;
  /** Moyennes mobiles demandées (`?overlays=ma50,ma200`), alignées sur `timestamps`. */
  movingAverages?: Partial<Record<ChartOverlayKey, (number | null)[]>> | undefined;
}

/** Calques optionnels du graphique de cours : moyennes mobiles 50 et 200 séances. */
export const CHART_OVERLAY_KEYS = ["ma50", "ma200"] as const;
export type ChartOverlayKey = (typeof CHART_OVERLAY_KEYS)[number];

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
  currentTaskLabel?: string | undefined;
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
  ticker?: string | undefined;
  tickers: string[];
  modules: string[];
  errorMessage?: string | undefined;
  internalSource?: string | undefined;
  durationMs: number;
}

export interface YahooUsageCallDto extends YahooUsageRecentErrorDto {
  success: boolean;
  tickerCount: number;
  range?: string | undefined;
  interval?: string | undefined;
  cacheHit: boolean;
  requestKey?: string | undefined;
}

export interface YahooUsageStatsDto {
  summary: YahooUsageSummaryDto;
  callsByHour: YahooUsageBucketDto[];
  callsByDay: YahooUsageBucketDto[];
  byMethod: YahooUsageBucketDto[];
  bySource: YahooUsageBucketDto[];
  topTickers: YahooUsageBucketDto[];
  topModules: YahooUsageBucketDto[];
  /** Appels des dernières 24 heures par fonctionnalité (hors filtres de période). */
  byFeature24h: YahooUsageBucketDto[];
  recentErrors: YahooUsageRecentErrorDto[];
}

