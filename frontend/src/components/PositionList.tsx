import type { DashboardSortKey, PositionRangePerformance, RangeKey, SortDirection } from "@pea/shared";
import { ArrowDownNarrowWide, ArrowDownRight, ArrowUpNarrowWide, ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [sortOpen, setSortOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSortKey(defaultSortKey);
    setSortDirection(defaultSortDirection);
  }, [defaultSortDirection, defaultSortKey]);

  useEffect(() => {
    if (!sortOpen) return undefined;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!sortMenuRef.current?.contains(event.target as Node)) setSortOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [sortOpen]);

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
    setSortOpen(false);
  }

  const rangeLabel = formatRangeLabel(range);
  const activeSort = sortOptions.find((option) => option.key === sortKey && option.direction === sortDirection) ?? sortOptions[0];
  const SortIcon = sortDirection === "asc" ? ArrowUpNarrowWide : ArrowDownNarrowWide;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line p-4">
        <div>
          <h2 className="font-semibold"><span className="sm:hidden">Liste des positions</span><span className="hidden sm:inline">Positions</span></h2>
          <p className="mt-1 text-xs text-slate-400">Tri actif: {activeSort.label}</p>
        </div>
        <div className="relative shrink-0" ref={sortMenuRef}>
          <button
            aria-expanded={sortOpen}
            aria-haspopup="menu"
            className="btn-ghost px-2.5 sm:px-3"
            onClick={() => setSortOpen((current) => !current)}
            title={sortDirection === "asc" ? "Trier vers le haut" : "Trier vers le bas"}
            type="button"
          >
            <SortIcon size={17} />
            <span className="hidden sm:inline">Trier</span>
          </button>
          {sortOpen && (
            <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-md border border-line bg-panel shadow-glow" role="menu">
              {sortOptions.map((option) => {
                const active = option.key === sortKey && option.direction === sortDirection;
                return (
                  <button
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-panel2 ${active ? "bg-sky/15 text-sky" : "text-slate-100"}`}
                    key={`${option.key}:${option.direction}`}
                    onClick={() => updateSort(`${option.key}:${option.direction}`)}
                    role="menuitemradio"
                    type="button"
                  >
                    <span>{option.label}</span>
                    {active && <span className="text-xs font-semibold">actif</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="divide-y divide-line">
        {sortedPositions.map((position) => {
          const positive = position.intervalPerformanceValue >= 0;

          return (
            <Link className="block min-w-0 p-3 transition hover:bg-panel2 sm:p-4" key={position.id} to={`/assets/${position.symbol}`}>
              <MobilePositionRow position={position} positive={positive} />
              <DesktopPositionRow position={position} positive={positive} rangeLabel={rangeLabel} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function MobilePositionRow({ position, positive }: { position: PositionRangePerformance; positive: boolean }) {
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_minmax(52px,64px)_minmax(82px,106px)] items-center gap-2 lg:hidden">
      <AssetIcon symbol={position.symbol} />
      <div className="min-w-0 leading-tight">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{position.name}</p>
        </div>
        <p className="truncate text-[11px] text-slate-400">
          {formatQuantity(position.quantity)} | {money(position.averageBuyPrice, position.currency)}
        </p>
      </div>
      <p className="truncate whitespace-nowrap text-right text-xs font-semibold tabular-nums">
        {position.stale && !position.currentPrice ? "n/a" : money(position.currentPrice, position.currency)}
      </p>
      <div className="min-w-0 text-right leading-tight">
        <p className="truncate whitespace-nowrap text-xs font-semibold tabular-nums">{money(position.currentMarketValue, position.currency)}</p>
        <p className={`mt-0.5 flex min-w-0 items-center justify-end gap-0.5 whitespace-nowrap text-[11px] font-semibold tabular-nums ${positive ? "text-mint" : "text-coral"}`}>
          <Icon size={12} />
          <span className="min-w-0 truncate">
            {money(position.intervalPerformanceValue, position.currency)} | {percent(position.intervalPerformancePercent)}
          </span>
        </p>
      </div>
    </div>
  );
}

function DesktopPositionRow({ position, positive, rangeLabel }: { position: PositionRangePerformance; positive: boolean; rangeLabel: string }) {
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="hidden min-w-0 gap-3 lg:grid lg:grid-cols-[1.5fr_.65fr_.85fr_.85fr_1fr] lg:items-center">
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

      <Info label="Quantite" value={`${formatQuantity(position.quantity)} actions`} />
      <Info label="Prix actuel" value={position.stale && !position.currentPrice ? "Prix indisponible" : money(position.currentPrice, position.currency)} />
      <Info label="Prix moyen" value={money(position.averageBuyPrice, position.currency)} />

      <div className="text-right">
        <p className="text-sm text-slate-400">Valeur | Perf {rangeLabel}</p>
        <p className="font-semibold">{money(position.currentMarketValue, position.currency)}</p>
        <p className={`mt-1 flex items-center justify-end gap-1 text-sm font-semibold ${positive ? "text-mint" : "text-coral"}`}>
          <Icon size={16} />
          {money(position.intervalPerformanceValue, position.currency)} | {percent(position.intervalPerformancePercent)}
        </p>
      </div>
    </div>
  );
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
