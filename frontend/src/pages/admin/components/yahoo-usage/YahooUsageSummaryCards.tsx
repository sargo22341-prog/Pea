import type { YahooUsageStatsDto } from "@pea/shared";
import { AlertTriangle, BarChart3, Clock, Gauge } from "lucide-react";
import { formatMs, formatNumber, formatPercent } from "./yahooUsageUtils";

export function YahooUsageSummaryCards({ data }: { data: YahooUsageStatsDto }) {
  const cards = [
    { label: "Appels aujourd'hui", value: formatNumber(data.summary.callsToday), icon: BarChart3 },
    { label: "Appels 24h", value: formatNumber(data.summary.calls24h), icon: Clock },
    { label: "Appels 7 jours", value: formatNumber(data.summary.calls7d), icon: BarChart3 },
    { label: "Taux d'erreur", value: formatPercent(data.summary.errorRate), icon: AlertTriangle },
    { label: "Duree moyenne", value: formatMs(data.summary.avgDurationMs), icon: Gauge }
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map(({ icon: Icon, label, value }) => (
        <div className="min-w-0 rounded-md border border-line bg-panel2/60 p-3" key={label}>
          <div className="flex items-center gap-2 text-slate-400">
            <Icon size={16} />
            <p className="muted">{label}</p>
          </div>
          <p className="mt-2 truncate text-lg font-semibold">{value}</p>
        </div>
      ))}
    </div>
  );
}
