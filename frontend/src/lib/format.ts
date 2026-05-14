import type { RangeKey } from "@pea/shared";
import { normalizeTimeZone } from "./timezone";

export type ChartRange = RangeKey | Uppercase<RangeKey>;

const rangeLabels: Record<RangeKey, string> = {
  "1d": "1 jour",
  "1w": "1 semaine",
  "1m": "1 mois",
  "1y": "1 an",
  "5y": "5 ans",
  "10y": "10 ans",
  ytd: "YTD",
  all: "Tout"
};

const compactRangeLabels: Record<RangeKey, string> = {
  "1d": "1 j.",
  "1w": "1 sem.",
  "1m": "1 mois",
  "1y": "1 an",
  "5y": "5 ans",
  "10y": "10 ans",
  ytd: "YTD",
  all: "Tout"
};

export function formatRangeLabel(range: ChartRange | string, options: { compact?: boolean } = {}) {
  const normalized = String(range).toLowerCase() as RangeKey;
  return (options.compact ? compactRangeLabels[normalized] : rangeLabels[normalized]) ?? String(range);
}

/**
 * Cache mémoïsé pour les `Intl.DateTimeFormat` et `Intl.NumberFormat`.
 *
 * Recharts appelle `tickFormatter` pour 50+ ticks × 60+ frames d'animation/seconde, ce qui
 * créait jusqu'à 3000 nouvelles instances `Intl.DateTimeFormat` par seconde. On les construit
 * désormais une seule fois par couple (locale, options) et on réutilise.
 */
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const numberFormatterCache = new Map<string, Intl.NumberFormat>();
const maxFormatterCacheEntries = 128;

function dateTimeFormatter(timeZone: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const resolvedTimeZone = normalizeTimeZone(timeZone);
  const key = `${resolvedTimeZone}|${JSON.stringify(options)}`;
  let formatter = dateTimeFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("fr-FR", { timeZone: resolvedTimeZone, ...options });
    dateTimeFormatterCache.set(key, formatter);
    trimFormatterCache(dateTimeFormatterCache);
  }
  return formatter;
}

function numberFormatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let formatter = numberFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("fr-FR", options);
    numberFormatterCache.set(key, formatter);
    trimFormatterCache(numberFormatterCache);
  }
  return formatter;
}

function trimFormatterCache<T>(cache: Map<string, T>) {
  while (cache.size > maxFormatterCacheEntries) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) return;
    cache.delete(oldestKey);
  }
}

export function money(value: number, currency = "EUR") {
  const safeValue = Number.isFinite(value) ? value : 0;
  return numberFormatter({
    style: "currency",
    currency,
    maximumFractionDigits: safeValue > 1000 ? 0 : 2
  }).format(safeValue);
}

export function percent(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${safeValue >= 0 ? "+" : ""}${numberFormatter({ maximumFractionDigits: 2 }).format(safeValue)} %`;
}

export function formatChartDate(value: string, timeZone?: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return dateTimeFormatter(timeZone, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  })
    .format(date)
    .replace(/\//g, "-");
}

export function formatChartTime(value: string, timeZone?: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return dateTimeFormatter(timeZone, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatChartWeekTick(value: string, timeZone?: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return dateTimeFormatter(timeZone, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatChartDateTime(value: string, timeZone?: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return dateTimeFormatter(timeZone, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })
    .format(date)
    .replace(/\//g, "-");
}

export function formatSignedMoney(value: number, currency: string) {
  return `${value > 0 ? "+" : ""}${money(value, currency)}`;
}

export function formatNumber(value: number) {
  return numberFormatter({ maximumFractionDigits: 6 }).format(value);
}

export function formatPlainPercent(value?: number) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${numberFormatter({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} %`;
}

export function formatMonthYear(value: string, timeZone?: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return dateTimeFormatter(timeZone, { month: "short", year: "2-digit" }).format(date);
}

export function formatMaybeInteger(value?: number) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return numberFormatter({ maximumFractionDigits: 0 }).format(value);
}

export function formatMaybeMoney(value: number | undefined, currency: string) {
  return value == null || !Number.isFinite(value) ? "n/a" : money(value, currency);
}

export function formatMaybePercentYield(value?: number) {
  if (value == null || !Number.isFinite(value) || value < 0 || value > 100) return "n/a";
  const normalized = value > 1 ? value : value * 100;
  return percent(normalized);
}

export function formatChange(value: number | undefined, percentValue: number | undefined, currency: string) {
  if ((value == null || !Number.isFinite(value)) && (percentValue == null || !Number.isFinite(percentValue))) return "n/a";
  const amount = value == null || !Number.isFinite(value) ? "n/a" : formatSignedMoney(value, currency);
  const pct = percentValue == null || !Number.isFinite(percentValue) ? "n/a" : percent(percentValue);
  return `${amount} (${pct})`;
}

export function formatMaybeDate(value?: string, timeZone?: string) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "n/a";
  return dateTimeFormatter(timeZone, { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function formatArticleDate(value?: string, timeZone?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return dateTimeFormatter(timeZone, { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}
