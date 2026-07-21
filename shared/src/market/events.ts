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
  | "asset-annex-updated"
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
  "asset-annex-updated",
  "analysis-updated",
  "dividends-updated",
  "scheduler-health-updated"
] as const;
