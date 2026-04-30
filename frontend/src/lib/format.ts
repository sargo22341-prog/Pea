import type { RangeKey } from "@pea/shared";

export type ChartRange = RangeKey | Uppercase<RangeKey>;

const rangeLabels: Record<RangeKey, string> = {
  "1d": "1 jour",
  "1w": "1 semaine",
  "1m": "1 mois",
  "1y": "1 an",
  ytd: "YTD",
  all: "Tout",
  max: "Max"
};

const compactRangeLabels: Record<RangeKey, string> = {
  "1d": "1 j.",
  "1w": "1 sem.",
  "1m": "1 mois",
  "1y": "1 an",
  ytd: "YTD",
  all: "Tout",
  max: "Max"
};

export function formatRangeLabel(range: ChartRange | string, options: { compact?: boolean } = {}) {
  const normalized = String(range).toLowerCase() as RangeKey;
  return (options.compact ? compactRangeLabels[normalized] : rangeLabels[normalized]) ?? String(range);
}

export function money(value: number, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: value > 1000 ? 0 : 2
  }).format(Number.isFinite(value) ? value : 0);
}

export function percent(value: number) {
  return `${value >= 0 ? "+" : ""}${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0)} %`;
}

export function shortDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(value));
}

export function formatChartDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  })
    .format(date)
    .replace(/\//g, "-");
}

export function formatChartTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatChartWeekTick(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatChartDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
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
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 }).format(value);
}

export function formatPlainPercent(value?: number) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} %`;
}

export function formatMonthYear(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(date);
}

export function formatMaybeInteger(value?: number) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
}

export function formatMaybeMoney(value: number | undefined, currency: string) {
  return value == null || !Number.isFinite(value) ? "n/a" : money(value, currency);
}

export function formatMaybePercentYield(value?: number) {
  return value == null || !Number.isFinite(value) ? "n/a" : percent(value * 100);
}

export function formatChange(value: number | undefined, percentValue: number | undefined, currency: string) {
  if ((value == null || !Number.isFinite(value)) && (percentValue == null || !Number.isFinite(percentValue))) return "n/a";
  const amount = value == null || !Number.isFinite(value) ? "n/a" : formatSignedMoney(value, currency);
  const pct = percentValue == null || !Number.isFinite(percentValue) ? "n/a" : percent(percentValue);
  return `${amount} (${pct})`;
}

export function formatMaybeDate(value?: string) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "n/a";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function formatArticleDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}
