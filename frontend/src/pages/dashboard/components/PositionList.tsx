import type { DashboardSortKey, PositionRangePerformance, PositionWithMarket, RangeKey, SortDirection } from "@pea/shared";
import { ArrowDownNarrowWide, ArrowUpNarrowWide } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePrivacy } from "../../../contexts/PrivacyContext";
import { api } from "../../../lib/api";
import { formatRangeLabel } from "../../../lib/format";
import { PositionRows } from "./PositionRows";

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
  positions: PositionWithMarket[];
  range: RangeKey;
  defaultSortKey?: DashboardSortKey;
  defaultSortDirection?: SortDirection;
}) {
  const [sortKey, setSortKey] = useState<DashboardSortKey>(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);
  const [sortOpen, setSortOpen] = useState(false);
  const [performanceById, setPerformanceById] = useState<Map<number, PositionRangePerformance>>(new Map());
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [performanceRefreshing, setPerformanceRefreshing] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const lastAutoReloadAt = useRef(0);

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

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setPerformanceError(null);
    setPerformanceById(new Map());
    api.positionsPerformance(range, controller.signal)
      .then((items) => {
        if (!cancelled) setPerformanceById(new Map(items.map((item) => [item.id, item])));
      })
      .catch((caughtError) => {
        if (!cancelled) setPerformanceError(caughtError instanceof Error ? caughtError.message : "Performances indisponibles");
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [range]);

  useEffect(() => {
    let debounceTimer: number | undefined;
    let refreshGuardTimer: number | undefined;

    function stopRefreshingSoon() {
      if (refreshGuardTimer) window.clearTimeout(refreshGuardTimer);
      refreshGuardTimer = window.setTimeout(() => setPerformanceRefreshing(false), 45_000);
    }

    function reloadPerformance() {
      const now = Date.now();
      if (now - lastAutoReloadAt.current < 1500) return;
      lastAutoReloadAt.current = now;
      api.positionsPerformance(range)
        .then((items) => {
          setPerformanceById(new Map(items.map((item) => [item.id, item])));
          setPerformanceRefreshing(false);
        })
        .catch((caughtError) => {
          setPerformanceError(caughtError instanceof Error ? caughtError.message : "Performances indisponibles");
          setPerformanceRefreshing(false);
        });
    }

    function scheduleReload() {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(reloadPerformance, 300);
    }

    function onMarketEvent(event: Event) {
      const payload = (event as CustomEvent<{ type?: string; range?: string }>).detail;
      if (payload.range && payload.range !== range) return;
      if (payload.type === "portfolio-performance-refresh-started" || payload.type === "portfolio-chart-refresh-started") {
        setPerformanceRefreshing(true);
        stopRefreshingSoon();
      }
      if (payload.type === "portfolio-performance-updated" || payload.type === "portfolio-chart-updated" || payload.type === "portfolio-assets-updated") scheduleReload();
    }

    window.addEventListener("pea:market-event", onMarketEvent);
    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      if (refreshGuardTimer) window.clearTimeout(refreshGuardTimer);
      window.removeEventListener("pea:market-event", onMarketEvent);
    };
  }, [range]);

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      if (sortKey === "name") return a.name.localeCompare(b.name, "fr") * direction;
      const comparison = sortValue(a, sortKey, performanceById) - sortValue(b, sortKey, performanceById);
      return comparison === 0 ? a.name.localeCompare(b.name, "fr") : comparison * direction;
    });
  }, [performanceById, positions, sortDirection, sortKey]);

  /**
   * Met a jour l'option de tri choisie dans le menu.
   */
  function updateSort(value: string) {
    const [key, direction] = value.split(":") as [DashboardSortKey, SortDirection];
    setSortKey(key);
    setSortDirection(direction);
    setSortOpen(false);
  }

  const prive = usePrivacy();
  const rangeLabel = formatRangeLabel(range);
  const activeSort = sortOptions.find((option) => option.key === sortKey && option.direction === sortDirection) ?? sortOptions[0];
  const SortIcon = sortDirection === "asc" ? ArrowUpNarrowWide : ArrowDownNarrowWide;

  return (
    <div className={`card overflow-hidden ${performanceRefreshing ? "stale-refreshing" : ""}`}>
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
      <PositionRows error={performanceError} performanceById={performanceById} positions={sortedPositions} prive={prive} rangeLabel={rangeLabel} />
    </div>
  );
}

/**
 * Retourne la valeur de tri stable disponible dans la synthese portefeuille.
 */
function sortValue(basePosition: PositionWithMarket, key: DashboardSortKey, performanceById: Map<number, PositionRangePerformance>) {
  const rangePerformance = performanceById.get(basePosition.id);
  if (key === "currentMarketValue") return rangePerformance?.currentMarketValue ?? basePosition.marketValue;
  return rangePerformance?.intervalPerformancePercent ?? basePosition.performancePercent;
}
