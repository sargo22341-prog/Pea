import type { YahooUsageStatsQuery } from "@pea/shared";

export type PeriodKey = "today" | "24h" | "7d" | "30d" | "custom";
export type SuccessFilter = "all" | "success" | "error";
export interface DetailSelection { label: string; filters: YahooUsageStatsQuery }

export const yahooUsageMethods = ["quote", "quoteSummary", "chart", "search", "historical", "options", "screener", "fundamentalsTimeSeries"];
