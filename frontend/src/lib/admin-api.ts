import type { AdminManagedUser, DataConstructionJobDto, RuntimeHealthDto, TrackedMarketsSettingsDto, YahooUsageCallDto, YahooUsageStatsDto } from "@pea/shared";
import { request } from "./api-core";

export type MarketDataRebuildRange = "1d" | "1w" | "1m" | "all" | "all_ranges";

export interface YahooUsageStatsFilters {
  dateFrom?: string;
  dateTo?: string;
  method?: string;
  module?: string;
  ticker?: string;
  source?: string;
  success?: boolean;
  groupBy?: "hour" | "day" | "method" | "module" | "ticker";
  id?: number;
  limit?: number;
}

function yahooUsageQuery(filters: YahooUsageStatsFilters) {
  const params = new URLSearchParams();
  if (filters.id !== undefined) params.set("id", String(filters.id));
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.method) params.set("method", filters.method);
  if (filters.module) params.set("module", filters.module);
  if (filters.ticker) params.set("ticker", filters.ticker);
  if (filters.source) params.set("source", filters.source);
  if (filters.success !== undefined) params.set("success", String(filters.success));
  if (filters.groupBy) params.set("groupBy", filters.groupBy);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  return params.toString();
}

export const adminApi = {
  adminUsers: () => request<AdminManagedUser[]>("/api/admin/users"),
  createAdminUser: (input: { username: string; password: string }) =>
    request<AdminManagedUser>("/api/admin/users", { method: "POST", body: JSON.stringify(input) }),
  deleteAdminUser: (userId: number) => request<void>(`/api/admin/users/${encodeURIComponent(String(userId))}`, { method: "DELETE" }),
  dataConstructionStatus: () => request<DataConstructionJobDto>("/api/admin/market-data/construction"),
  getRuntimeHealth: () => request<RuntimeHealthDto>("/api/admin/runtime-health"),
  yahooUsageStats: (filters: YahooUsageStatsFilters = {}) => {
    const query = yahooUsageQuery(filters);
    return request<YahooUsageStatsDto>(`/api/admin/yahoo-usage/stats${query ? `?${query}` : ""}`);
  },
  yahooUsageCalls: (filters: YahooUsageStatsFilters = {}) => {
    const query = yahooUsageQuery(filters);
    return request<YahooUsageCallDto[]>(`/api/admin/yahoo-usage/calls${query ? `?${query}` : ""}`);
  },
  trackedMarketsSettings: () => request<TrackedMarketsSettingsDto>("/api/admin/market-data/tracked-markets"),
  deleteTrackedMarket: (marketKey: string) =>
    request<{ marketKey: string; markets: number; runs: number; logs: number }>(`/api/admin/market-data/tracked-markets/${encodeURIComponent(marketKey)}`, { method: "DELETE" }),
  rebuildMarketData: (range: MarketDataRebuildRange) =>
    request<DataConstructionJobDto>("/api/admin/market-data/rebuild", { method: "POST", body: JSON.stringify({ range }) }),
  rebuildAllMarketData: () =>
    request<DataConstructionJobDto>("/api/admin/market-data/rebuild", { method: "POST", body: JSON.stringify({ range: "all_ranges" }) }),
  cleanupUnlinkedMarketAssets: () => request<DataConstructionJobDto>("/api/admin/market-data/cleanup-unlinked-assets", { method: "POST" }),
  refreshAnnexData: () => request<DataConstructionJobDto>("/api/admin/market-data/refresh-annex", { method: "POST" })
};
