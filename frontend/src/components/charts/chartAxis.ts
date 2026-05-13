import type { MarketSessionDto, RangeKey } from "@pea/shared";
import { formatChartDate, formatChartDateTime, formatChartTime, formatChartWeekTick } from "../../lib/format";
import { normalizeTimeZone } from "../../lib/timezone";

export function formatHistoryTick(value: string | number, range: RangeKey, userTimezone?: string) {
  const dateValue = chartDateValue(value);
  if (range === "1d") return formatChartTime(dateValue, userTimezone);
  if (range === "1w" || range === "1m") return formatChartWeekTick(dateValue, userTimezone);
  return formatChartDate(dateValue, userTimezone);
}

export function formatHistoryTooltipLabel(value: string | number, range: RangeKey, oneDayFormat: "dateTime" | "time", userTimezone?: string, marketSession?: MarketSessionDto) {
  const dateValue = chartDateValue(value);
  if (range === "1d") {
    const userLabel = oneDayFormat === "time" ? formatChartTime(dateValue, userTimezone) : formatChartDateTime(dateValue, userTimezone);
    if (!marketSession || normalizeTimeZone(marketSession.timezone) === normalizeTimeZone(userTimezone)) return userLabel;
    return `${userLabel} | ${formatChartDateTime(dateValue, marketSession.timezone)} (${marketSession.city})`;
  }
  if (range === "1w" || range === "1m") return formatChartDateTime(dateValue, userTimezone);
  return formatChartDate(dateValue, userTimezone);
}

function chartDateValue(value: string | number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Date(numeric).toISOString() : String(value);
}
