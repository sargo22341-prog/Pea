import type { YahooUsageStatsFilters } from "../../../../lib/api";

export type PeriodKey = "today" | "24h" | "7d" | "30d" | "custom";
export type SuccessFilter = "all" | "success" | "error";
export type DetailSelection = { label: string; filters: YahooUsageStatsFilters };

export const yahooUsageMethods = ["quote", "quoteSummary", "chart", "search", "historical", "options", "screener", "fundamentalsTimeSeries"];
