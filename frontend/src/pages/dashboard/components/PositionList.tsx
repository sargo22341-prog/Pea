import type { DashboardSortKey, MarketEventType, PositionRangePerformance, PositionWithMarket, RangeKey, SortDirection } from "@pea/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePrivacy } from "../../../contexts/PrivacyContext";
import { useMarketEventReload, type MarketEventPayload } from "../../../hooks/useMarketEventReload";
import { api } from "../../../lib/api";
import { formatRangeLabel } from "../../../lib/format";
import { PositionRows } from "./PositionRows";
import { SortableSection, type SortOption } from "./SortableSection";
import { sortPositions } from "./dashboardSort.helpers";

const sortOptions: Array<SortOption<DashboardSortKey>> = [
  { label: "Nom A -> Z", key: "name", direction: "asc" },
  { label: "Nom Z -> A", key: "name", direction: "desc" },
  { label: "Valeur marche croissante", key: "currentMarketValue", direction: "asc" },
  { label: "Valeur marche decroissante", key: "currentMarketValue", direction: "desc" },
  { label: "Variation % croissante", key: "intervalPerformancePercent", direction: "asc" },
  { label: "Variation % decroissante", key: "intervalPerformancePercent", direction: "desc" }
];

const performanceReloadEvents: MarketEventType[] = ["portfolio-performance-updated", "portfolio-chart-updated", "portfolio-assets-updated"];

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
  const [performanceById, setPerformanceById] = useState<Map<number, PositionRangePerformance>>(new Map());
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [performanceRefreshing, setPerformanceRefreshing] = useState(false);
  const refreshGuardTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setSortKey(defaultSortKey);
    setSortDirection(defaultSortDirection);
  }, [defaultSortDirection, defaultSortKey]);

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

  useMarketEventReload({
    debounceMs: 300,
    eventTypes: performanceReloadEvents,
    filterEvent: (payload) => !payload.range || payload.range === range,
    onEvent: (payload: MarketEventPayload) => {
      if (payload.range && payload.range !== range) return;
      if (payload.type !== "portfolio-performance-refresh-started" && payload.type !== "portfolio-chart-refresh-started") return;
      setPerformanceRefreshing(true);
      if (refreshGuardTimer.current) window.clearTimeout(refreshGuardTimer.current);
      refreshGuardTimer.current = window.setTimeout(() => setPerformanceRefreshing(false), 45_000);
    },
    reload: () =>
      api.positionsPerformance(range)
        .then((items) => {
          setPerformanceById(new Map(items.map((item) => [item.id, item])));
          setPerformanceRefreshing(false);
        })
        .catch((caughtError) => {
          setPerformanceError(caughtError instanceof Error ? caughtError.message : "Performances indisponibles");
          setPerformanceRefreshing(false);
        }),
    reloadOnFocus: false,
    reloadOnVisibility: false
  });

  useEffect(() => {
    return () => {
      if (refreshGuardTimer.current) window.clearTimeout(refreshGuardTimer.current);
    };
  }, []);

  const sortedPositions = useMemo(() => {
    return sortPositions(positions, sortKey, sortDirection, performanceById);
  }, [performanceById, positions, sortDirection, sortKey]);

  function updateSort(key: DashboardSortKey, direction: SortDirection) {
    setSortKey(key);
    setSortDirection(direction);
  }

  const prive = usePrivacy();
  const rangeLabel = formatRangeLabel(range);

  return (
    <SortableSection
      activeDirection={sortDirection}
      activeKey={sortKey}
      className={`card overflow-hidden ${performanceRefreshing ? "stale-refreshing" : ""}`}
      onSortChange={updateSort}
      options={sortOptions}
      title={
        <h2 className="font-semibold">
          <span className="sm:hidden">Liste des positions</span>
          <span className="hidden sm:inline">Positions</span>
        </h2>
      }
    >
      <PositionRows error={performanceError} performanceById={performanceById} positions={sortedPositions} prive={prive} rangeLabel={rangeLabel} />
    </SortableSection>
  );
}
