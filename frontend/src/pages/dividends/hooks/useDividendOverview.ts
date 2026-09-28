import type { CurrencyCode, PortfolioDividendEvent } from "@pea/shared";
import { useMemo } from "react";
import type { DividendGroup } from "../components/DividendAssetRow";
import type { MonthlyDividend } from "../components/DividendAnnualEstimate";
import { FALLBACK_TIMEZONE } from "../../../lib/timezone";
import { projectDividendYear, type DividendOverviewEvent } from "../utils/projectDividendYear";
import { dividendGrowthBySymbol, dividendStatusTotals } from "../utils/dividendInsights";
import { defaultReinvestmentGrowth } from "../utils/reinvestmentSimulation";

const currentYear = new Date().getUTCFullYear();

export function useDividendOverview({
  currency,
  past = [],
  upcoming = [],
  year
}: {
  currency?: CurrencyCode | undefined;
  past?: PortfolioDividendEvent[] | undefined;
  upcoming?: PortfolioDividendEvent[] | undefined;
  year: string;
}) {
  const knownEvents = useMemo<DividendOverviewEvent[]>(() => [...upcoming, ...past], [past, upcoming]);
  // L'annee suivante n'existe pas cote serveur : elle est projetee ici a partir des deux dernieres.
  const projectedEvents = useMemo(() => projectDividendYear(knownEvents, currentYear + 1), [knownEvents]);
  const allEvents = useMemo(() => [...knownEvents, ...projectedEvents], [knownEvents, projectedEvents]);
  const years = useMemo(() => {
    const knownYears = new Set([String(currentYear), ...allEvents.map((event) => String(event.year))]);
    return [...knownYears].sort((a, b) => Number(b) - Number(a));
  }, [allEvents]);

  const selectedYear = Number(year);
  const growthBySymbol = useMemo(() => dividendGrowthBySymbol(past, currentYear), [past]);
  const groups = useMemo(
    () => groupDividendsByAsset(allEvents, selectedYear).map((group) => ({ ...group, growth: growthBySymbol.get(group.symbol) })),
    [allEvents, growthBySymbol, selectedYear]
  );
  // Croissance proposée à la simulation : revenus de l'année en cours, quelle que soit l'année affichée.
  const reinvestmentGrowth = useMemo(
    () => defaultReinvestmentGrowth(groupDividendsByAsset(allEvents, currentYear).map((group) => ({ income: group.total, growthRate: growthBySymbol.get(group.symbol)?.growthRate }))),
    [allEvents, growthBySymbol]
  );
  const statusTotals = useMemo(() => dividendStatusTotals(allEvents, selectedYear), [allEvents, selectedYear]);
  const monthlyDividends = useMemo(() => groupDividendsByMonth(allEvents, selectedYear, currency ?? "EUR"), [allEvents, currency, selectedYear]);
  const total = useMemo(() => groups.reduce((sum, group) => sum + group.total, 0), [groups]);
  const displayCurrency = groups[0]?.currency ?? currency ?? "EUR";
  const stale = allEvents.some((event) => event.stale);

  return {
    allEvents,
    currency: displayCurrency,
    groups,
    monthlyDividends,
    projectedYear: projectedEvents.length ? String(currentYear + 1) : undefined,
    reinvestmentGrowth,
    stale,
    statusTotals,
    total,
    years
  };
}

export function getCurrentDividendYear() {
  return currentYear;
}

function groupDividendsByMonth(events: DividendOverviewEvent[], year: number, fallbackCurrency: CurrencyCode): MonthlyDividend[] {
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
    if (!month) continue;
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

function groupDividendsByAsset(events: DividendOverviewEvent[], year: number): DividendGroup[] {
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
      payoutRatio: event.payoutRatio,
      hasAnnounced: false,
      hasEstimated: false,
      hasProjected: false,
      stale: false
    };
    const quarter = quarterIndex(event.date);

    existing.quantity = event.quantity;
    existing.total += safeNumber(event.totalAmount);
    existing.quarters[quarter] = (existing.quarters[quarter] ?? 0) + safeNumber(event.totalAmount);
    existing.hasAnnounced = existing.hasAnnounced || event.status === "announced";
    existing.hasEstimated = existing.hasEstimated || event.status === "estimated";
    existing.hasProjected = existing.hasProjected || event.projected === true;
    existing.stale = existing.stale || event.stale;
    existing.dividendPercent = firstFinite(existing.dividendPercent, event.dividendPercent);
    existing.yieldOnCostPercent = firstFinite(existing.yieldOnCostPercent, event.yieldOnCostPercent);
    existing.payoutRatio = firstFinite(existing.payoutRatio, event.payoutRatio);

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
