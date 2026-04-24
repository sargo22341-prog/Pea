import type { RangeKey } from "@pea/shared";
import { Activity, Briefcase, LineChart, Wallet } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { PortfolioChart } from "../components/PortfolioChart";
import { PositionList } from "../components/PositionList";
import { RangeSelector } from "../components/RangeSelector";
import { WatchlistSection } from "../components/WatchlistSection";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { money, percent } from "../lib/format";

export function DashboardPage() {
  const [range, setRange] = useState<RangeKey>("1m");
  const portfolio = useAsync(() => api.portfolio(), []);
  const performance = useAsync(() => api.performance(range), [range]);

  if (portfolio.loading) return <div className="card p-6">Chargement du portefeuille...</div>;
  if (portfolio.error) return <div className="card border-coral p-6 text-coral">{portfolio.error}</div>;
  if (!portfolio.data || portfolio.data.positions.length === 0) return <EmptyState />;

  const summary = portfolio.data;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-4">
        <Metric icon={Wallet} label="Valeur totale" value={money(summary.totalValue, summary.currency)} />
        <Metric icon={Briefcase} label="Lignes" value={String(summary.assetsCount)} />
        <Metric icon={Activity} label="Titres détenus" value={new Intl.NumberFormat("fr-FR").format(summary.positionsCount)} />
        <Metric
          icon={LineChart}
          label="Performance"
          tone={summary.totalPerformance >= 0 ? "positive" : "negative"}
          value={`${money(summary.totalPerformance, summary.currency)} (${percent(summary.totalPerformancePercent)})`}
        />
      </section>

      <section className="card p-4">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-xl font-bold">Évolution du portefeuille</h1>
            <p className="muted">Valorisation agrégée depuis les historiques Yahoo Finance.</p>
          </div>
          <RangeSelector onChange={setRange} value={range} />
        </div>
        {performance.loading ? <div className="h-72 p-6 text-slate-400">Chargement du graphique...</div> : <PortfolioChart data={performance.data ?? []} />}
      </section>

      <PositionList positions={summary.positions} />
      <WatchlistSection />
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Wallet; label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="muted">{label}</p>
        <Icon className="text-sky" size={20} />
      </div>
      <p className={`text-xl font-bold ${tone === "positive" ? "text-mint" : tone === "negative" ? "text-coral" : ""}`}>{value}</p>
    </div>
  );
}
