import type { RangeKey } from "./market.js";

export type DashboardSortKey = "name" | "currentMarketValue" | "intervalPerformancePercent";
export type WatchlistSortKey = "name" | "price" | "performancePercent";
export type SortDirection = "asc" | "desc";
export type NewsLanguage = "fr" | "en";

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
  privacyModeEnabled: boolean;
  createdAt: string;
}

export interface AuthMe {
  user: User | null;
  setupRequired: boolean;
  appTimezone: string;
}
