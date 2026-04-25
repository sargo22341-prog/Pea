import type { RangeKey, User } from "@pea/shared";
import { Activity, Briefcase, LineChart, Wallet } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { PortfolioChart } from "../components/PortfolioChart";
import { PositionList } from "../components/PositionList";
import { RangeSelector } from "../components/RangeSelector";
import { WatchlistSection } from "../components/WatchlistSection";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { normalizePortfolioPerformanceData } from "../lib/chart";
import { formatRangeLabel, money, percent } from "../lib/format";

export function DashboardPage({ user }: { user: User }) {
  const [selectedRange, setSelectedRangeState] = useState<RangeKey>(() => {
    const initialRange = user.defaultChartRange ?? "1d";
    return initialRange;
  });
  const portfolio = useAsync((signal) => api.portfolio(selectedRange, signal), [selectedRange]);
  const performance = useAsync(() => api.performance(selectedRange), [selectedRange]);
  const positionsPerformance = useAsync(() => api.positionsPerformance(selectedRange), [selectedRange]);

  function setSelectedRange(source: string, nextRange: RangeKey) {
    setSelectedRangeState((previousRange) => {
      void source;
      void previousRange;
      return nextRange;
    });
  }

  if (portfolio.loading) return <div className="card p-6">Chargement du portefeuille...</div>;
  if (portfolio.error) return <div className="card border-coral p-6 text-coral">{portfolio.error}</div>;
  if (!portfolio.data || portfolio.data.positions.length === 0) return <EmptyState />;

  const summary = portfolio.data;
  const rangePerformance = getRangePerformance(performance.data ?? []);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric icon={Wallet} label="Valeur totale" value={money(summary.totalValue, summary.currency)} />
        <Metric icon={Briefcase} label="Lignes" value={String(summary.assetsCount)} />
        <Metric
          icon={LineChart}
          label="Performance"
          tone={summary.totalPerformance >= 0 ? "positive" : "negative"}
          value={`${money(summary.totalPerformance, summary.currency)} (${percent(summary.totalPerformancePercent)})`}
        />
        <Metric
          icon={Activity}
          label={`Performance sur ${formatRangeLabel(selectedRange)}`}
          tone={rangePerformance == null ? undefined : rangePerformance.value >= 0 ? "positive" : "negative"}
          value={performance.loading || rangePerformance == null ? "—" : `${money(rangePerformance.value, summary.currency)} · ${percent(rangePerformance.percent)}`}
        />
      </section>

      <section className="card p-4">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-xl font-bold">Evolution du portefeuille</h1>
            <p className="muted">Valorisation agregee depuis les historiques Yahoo Finance.</p>
          </div>
          <RangeSelector onChange={(nextRange) => setSelectedRange("user-click", nextRange)} value={selectedRange} />
        </div>
        {performance.loading ? <div className="h-72 p-6 text-slate-400">Chargement du graphique...</div> : <PortfolioChart data={performance.data ?? []} range={selectedRange} />}
      </section>

      {positionsPerformance.loading ? (
        <div className="card p-6 text-slate-400">Chargement des positions...</div>
      ) : (
        <PositionList
          defaultSortDirection={user.dashboardDefaultSortDirection}
          defaultSortKey={user.dashboardDefaultSortKey}
          positions={positionsPerformance.data ?? []}
          range={selectedRange}
        />
      )}
      <WatchlistSection range={selectedRange} />
    </div>
  );
}

function getRangePerformance(points: Array<{ date: string; value: number }>) {
  const sorted = normalizePortfolioPerformanceData(points);
  const first = sorted[0]?.value;
  const last = sorted[sorted.length - 1]?.value;
  if (!first || !Number.isFinite(first) || !Number.isFinite(last)) return null;
  const value = last - first;
  return { value, percent: (value / first) * 100 };
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Wallet; label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="card min-w-0 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="muted truncate">{label}</p>
        <Icon className="shrink-0 text-sky" size={20} />
      </div>
      <p className={`break-words text-lg font-bold sm:text-xl ${tone === "positive" ? "text-mint" : tone === "negative" ? "text-coral" : ""}`}>{value}</p>
    </div>
  );
}
