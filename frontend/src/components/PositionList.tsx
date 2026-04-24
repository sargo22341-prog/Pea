import type { DashboardSortKey, PositionRangePerformance, RangeKey, SortDirection } from "@pea/shared";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatRangeLabel, money, percent } from "../lib/format";
import { AssetIcon } from "./AssetIcon";

const sortOptions: Array<{ label: string; key: DashboardSortKey; direction: SortDirection }> = [
  { label: "Nom A -> Z", key: "name", direction: "asc" },
  { label: "Nom Z -> A", key: "name", direction: "desc" },
  { label: "Valeur marche croissante", key: "currentMarketValue", direction: "asc" },
  { label: "Valeur marche decroissante", key: "currentMarketValue", direction: "desc" },
  { label: "Variation % croissante", key: "intervalPerformancePercent", direction: "asc" },
  { label: "Variation % decroissante", key: "intervalPerformancePercent", direction: "desc" }
];

export function PositionList({
  positions,
  range,
  defaultSortKey = "name",
  defaultSortDirection = "asc"
}: {
  positions: PositionRangePerformance[];
  range: RangeKey;
  defaultSortKey?: DashboardSortKey;
  defaultSortDirection?: SortDirection;
}) {
  const [sortKey, setSortKey] = useState<DashboardSortKey>(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

  useEffect(() => {
    setSortKey(defaultSortKey);
    setSortDirection(defaultSortDirection);
  }, [defaultSortDirection, defaultSortKey]);

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      if (sortKey === "name") return a.name.localeCompare(b.name, "fr") * direction;
      return (a[sortKey] - b[sortKey]) * direction;
    });
  }, [positions, sortDirection, sortKey]);

  function updateSort(value: string) {
    const [key, direction] = value.split(":") as [DashboardSortKey, SortDirection];
    setSortKey(key);
    setSortDirection(direction);
  }

  const rangeLabel = formatRangeLabel(range);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Positions</h2>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          Trier
          <select className="input w-full sm:w-60" onChange={(event) => updateSort(event.target.value)} value={`${sortKey}:${sortDirection}`}>
            {sortOptions.map((option) => (
              <option key={`${option.key}:${option.direction}`} value={`${option.key}:${option.direction}`}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="divide-y divide-line">
        {sortedPositions.map((position) => {
          const positive = position.intervalPerformanceValue >= 0;
          const Icon = positive ? ArrowUpRight : ArrowDownRight;

          return (
            <Link
              className="grid gap-3 p-4 transition hover:bg-panel2 lg:grid-cols-[1.5fr_.65fr_.85fr_.85fr_1fr] lg:items-center"
              key={position.id}
              to={`/assets/${position.symbol}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <AssetIcon symbol={position.symbol} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{position.name}</p>
                    {position.incompleteData && <span className="rounded bg-amber/15 px-2 py-1 text-[11px] font-semibold text-amber">partiel</span>}
                  </div>
                  <p className="muted">{position.symbol}</p>
                </div>
              </div>

              <Info label="Quantite" value={`${new Intl.NumberFormat("fr-FR").format(position.quantity)} actions`} />
              <Info label="Prix actuel" value={position.stale && !position.currentPrice ? "Prix indisponible" : money(position.currentPrice, position.currency)} />
              <Info label="Prix moyen" value={money(position.averageBuyPrice, position.currency)} />

              <div className="rounded-md border border-line bg-ink p-3 text-left lg:border-0 lg:bg-transparent lg:p-0 lg:text-right">
                <p className="text-sm text-slate-400">Valeur · Perf {rangeLabel}</p>
                <p className="font-semibold">{money(position.currentMarketValue, position.currency)}</p>
                <p className={`mt-1 flex items-center gap-1 text-sm font-semibold lg:justify-end ${positive ? "text-mint" : "text-coral"}`}>
                  <Icon size={16} />
                  {money(position.intervalPerformanceValue, position.currency)} · {percent(position.intervalPerformancePercent)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-ink p-3 lg:border-0 lg:bg-transparent lg:p-0 lg:text-right">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
