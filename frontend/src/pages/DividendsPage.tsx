import type { CurrencyCode, PortfolioDividendEvent } from "@pea/shared";
import { useMemo, useState } from "react";
import { DividendAnnualEstimate, type MonthlyDividend } from "../components/DividendAnnualEstimate";
import { DividendGroupedList, type DividendGroup } from "../components/DividendGroupedList";
import { StaleBadge } from "../components/StaleBadge";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";

const currentYear = new Date().getFullYear();

export function DividendsPage() {
  const dividends = useAsync(() => api.portfolioDividends(), []);
  const [year, setYear] = useState(String(currentYear));

  const data = dividends.data;
  const allEvents = useMemo(() => [...(data?.upcoming ?? []), ...(data?.past ?? [])], [data?.past, data?.upcoming]);
  const years = useMemo(() => {
    const knownYears = new Set([String(currentYear), ...allEvents.map((event) => String(event.year))]);
    return [...knownYears].sort((a, b) => Number(b) - Number(a));
  }, [allEvents]);

  const selectedYear = Number(year);
  const groups = useMemo(() => groupDividendsByAsset(allEvents, selectedYear), [allEvents, selectedYear]);
  const monthlyDividends = useMemo(() => groupDividendsByMonth(allEvents, selectedYear, data?.currency ?? "EUR"), [allEvents, data?.currency, selectedYear]);
  const selectedTotal = groups.reduce((sum, group) => sum + group.total, 0);
  const currency = groups[0]?.currency ?? data?.currency ?? "EUR";

  if (dividends.loading) return <div className="card p-6">Chargement des dividendes...</div>;
  if (dividends.error) return <div className="card border-coral p-6 text-coral">{dividends.error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Dividendes</h1>
          <StaleBadge show={data?.stale || allEvents.some((event) => event.stale)} />
        </div>
        <p className="muted">Vue annuelle regroupee par action, avec repartition trimestrielle.</p>
      </div>

      <DividendAnnualEstimate
        currency={currency}
        monthlyDividends={monthlyDividends}
        onYearChange={setYear}
        total={selectedTotal}
        year={year}
        years={years}
      />

      <DividendGroupedList currency={currency} groups={groups} total={selectedTotal} year={year} />
    </div>
  );
}

function groupDividendsByMonth(events: PortfolioDividendEvent[], year: number, fallbackCurrency: CurrencyCode): MonthlyDividend[] {
  const months: MonthlyDividend[] = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(year, index, 1);
    return {
      month: `${year}-${String(index + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date).replace(".", ""),
      total: 0,
      currency: fallbackCurrency,
      entries: []
    };
  });

  for (const event of events) {
    if (event.year !== year) continue;
    const date = new Date(event.date);
    if (!Number.isFinite(date.getTime())) continue;

    const month = months[date.getMonth()];
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
  return Math.min(3, Math.max(0, Math.floor(date.getMonth() / 3)));
}

function safeNumber(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function firstFinite(current: number | undefined, next: number | undefined) {
  return Number.isFinite(current) ? current : Number.isFinite(next) ? next : undefined;
}
