import type { YahooUsageBucketDto } from "@pea/shared";
import type { YahooUsageStatsFilters } from "../../../../lib/api";
import type { PeriodKey } from "./yahooUsageTypes";

export function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function isoLocalInput(value: Date) {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function dateFromPeriod(period: PeriodKey) {
  const now = new Date();
  if (period === "today") return startOfToday();
  if (period === "24h") return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (period === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (period === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return undefined;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, style: "percent" }).format(value);
}

export function formatMs(value: number) {
  return `${formatNumber(Math.round(value))} ms`;
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit" }).format(date);
}

export function bucketRange(bucket: YahooUsageBucketDto, groupBy: "hour" | "day"): Pick<YahooUsageStatsFilters, "dateFrom" | "dateTo"> {
  const start = groupBy === "hour" ? new Date(bucket.key) : new Date(`${bucket.key}T00:00:00.000Z`);
  const end = new Date(start);
  if (groupBy === "hour") end.setUTCHours(end.getUTCHours() + 1);
  else end.setUTCDate(end.getUTCDate() + 1);
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
}

export function chartBucketPayload(value: unknown): YahooUsageBucketDto {
  const maybePayload = value && typeof value === "object" && "payload" in value ? (value as { payload?: unknown }).payload : value;
  return maybePayload as YahooUsageBucketDto;
}
