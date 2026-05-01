import type { CurrencyCode, PortfolioDividendEvent } from "@pea/shared";
import { useMemo } from "react";
import type { DividendGroup } from "../components/dividends/DividendGroupedList";
import type { MonthlyDividend } from "../components/dividends/DividendAnnualEstimate";
import { FALLBACK_TIMEZONE } from "../lib/timezone";

const currentYear = new Date().getUTCFullYear();

export function useDividendOverview({
  currency,
  past = [],
  upcoming = [],
  year
}: {
  currency?: CurrencyCode;
  past?: PortfolioDividendEvent[];
  upcoming?: PortfolioDividendEvent[];
  year: string;
}) {
  const allEvents = useMemo(() => [...upcoming, ...past], [past, upcoming]);
  const years = useMemo(() => {
    const knownYears = new Set([String(currentYear), ...allEvents.map((event) => String(event.year))]);
    return [...knownYears].sort((a, b) => Number(b) - Number(a));
  }, [allEvents]);

  const selectedYear = Number(year);
  const groups = useMemo(() => groupDividendsByAsset(allEvents, selectedYear), [allEvents, selectedYear]);
  const monthlyDividends = useMemo(() => groupDividendsByMonth(allEvents, selectedYear, currency ?? "EUR"), [allEvents, currency, selectedYear]);
  const total = useMemo(() => groups.reduce((sum, group) => sum + group.total, 0), [groups]);
  const displayCurrency = groups[0]?.currency ?? currency ?? "EUR";
  const stale = allEvents.some((event) => event.stale);

  return {
    allEvents,
    currency: displayCurrency,
    groups,
    monthlyDividends,
    stale,
    total,
    years
  };
}

export function getCurrentDividendYear() {
  return currentYear;
}

function groupDividendsByMonth(events: PortfolioDividendEvent[], year: number, fallbackCurrency: CurrencyCode): MonthlyDividend[] {
  const months: MonthlyDividend[] = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, index, 1));
    return {
      month: `${year}-${String(index + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("fr-FR", { timeZone: FALLBACK_TIMEZONE, month: "short" }).format(date).replace(".", ""),
      total: 0,
      currency: fallbackCurrency,
      entries: []
    };
  });

  for (const event of events) {
    if (event.year !== year) continue;
    const date = new Date(event.date);
    if (!Number.isFinite(date.getTime())) continue;

    const month = months[date.getUTCMonth()];
    const amount = safeNumber(event.totalAmount);
    const existing = month.entries.find((entry) => entry.symbol === event.symbol);

    month.total += amount;
    month.currency = event.currency;

    if (existing) {
      existing.amount += amount;
      continue;
    }

    month.entries.push({
      symbol: event.symbol,
      name: event.name,
      amount,
      currency: event.currency
    });
  }

  return months.map((month) => ({
    ...month,
    entries: month.entries.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "fr"))
  }));
}

function groupDividendsByAsset(events: PortfolioDividendEvent[], year: number): DividendGroup[] {
  const groups = new Map<string, DividendGroup>();

  for (const event of events) {
    if (event.year !== year) continue;

    const existing = groups.get(event.symbol) ?? {
      symbol: event.symbol,
      name: event.name,
      quantity: event.quantity,
      currency: event.currency,
      quarters: [0, 0, 0, 0],
      total: 0,
      dividendPercent: event.dividendPercent,
      yieldOnCostPercent: event.yieldOnCostPercent,
      hasEstimated: false,
      stale: false
    };
    const quarter = quarterIndex(event.date);

    existing.quantity = event.quantity;
    existing.total += safeNumber(event.totalAmount);
    existing.quarters[quarter] += safeNumber(event.totalAmount);
    existing.hasEstimated = existing.hasEstimated || event.status === "estimated";
    existing.stale = existing.stale || event.stale;
    existing.dividendPercent = firstFinite(existing.dividendPercent, event.dividendPercent);
    existing.yieldOnCostPercent = firstFinite(existing.yieldOnCostPercent, event.yieldOnCostPercent);

    groups.set(event.symbol, existing);
  }

  return [...groups.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "fr"));
}

function quarterIndex(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 0;
  return Math.min(3, Math.max(0, Math.floor(date.getUTCMonth() / 3)));
}

function safeNumber(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function firstFinite(current: number | undefined, next: number | undefined) {
  return Number.isFinite(current) ? current : Number.isFinite(next) ? next : undefined;
}
