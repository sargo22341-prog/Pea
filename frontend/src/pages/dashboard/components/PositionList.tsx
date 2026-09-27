import type { DashboardSortKey, MarketEventType, PositionRangePerformance, PositionWithMarket, RangeKey, SortDirection } from "@pea/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../contexts/privacy-context";
import { useMarketEventReload, type MarketEventPayload } from "../../../hooks/useMarketEventReload";
import { api } from "../../../lib/api";
import { formatRangeLabel } from "../../../lib/format";
import { PositionRows } from "./PositionRows";
import { SortableSection, type SortOption } from "./SortableSection";
import { sortPositions } from "./dashboardSort.helpers";

const sortOptions: (Omit<SortOption<DashboardSortKey>, "label"> & { labelKey: string })[] = [
  { labelKey: "sort.nameAsc", key: "name", direction: "asc" },
  { labelKey: "sort.nameDesc", key: "name", direction: "desc" },
  { labelKey: "sort.marketValueAsc", key: "currentMarketValue", direction: "asc" },
  { labelKey: "sort.marketValueDesc", key: "currentMarketValue", direction: "desc" },
  { labelKey: "sort.variationAsc", key: "intervalPerformancePercent", direction: "asc" },
  { labelKey: "sort.variationDesc", key: "intervalPerformancePercent", direction: "desc" }
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
  const { t } = useTranslation(["dashboard", "settings"]);
  const [sortKey, setSortKey] = useState<DashboardSortKey>(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);
  const [performanceById, setPerformanceById] = useState<Map<number, PositionRangePerformance>>(new Map());
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [performanceRefreshing, setPerformanceRefreshing] = useState(false);
  const refreshGuardTimer = useRef<number | undefined>(undefined);

  // Preferences et periode sont resynchronisees pendant le rendu (pas d'effet en cascade).
  const [syncedDefaults, setSyncedDefaults] = useState({ key: defaultSortKey, direction: defaultSortDirection });
  if (syncedDefaults.key !== defaultSortKey || syncedDefaults.direction !== defaultSortDirection) {
    setSyncedDefaults({ key: defaultSortKey, direction: defaultSortDirection });
    setSortKey(defaultSortKey);
    setSortDirection(defaultSortDirection);
  }
  const [performanceRange, setPerformanceRange] = useState(range);
  if (performanceRange !== range) {
    setPerformanceRange(range);
    setPerformanceError(null);
    setPerformanceById(new Map());
  }

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    api.positionsPerformance(range, controller.signal)
      .then((items) => {
        if (!cancelled) setPerformanceById(new Map(items.map((item) => [item.id, item])));
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) setPerformanceError(caughtError instanceof Error ? caughtError.message : t("positionRows.performanceUnavailable", { ns: "dashboard" }));
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [range, t]);

  useMarketEventReload({
    debounceMs: 300,
    eventTypes: performanceReloadEvents,
    filterEvent: (payload) => !payload.range || payload.range === range,
    onEvent: (payload: MarketEventPayload) => {
      if (payload.range && payload.range !== range) return;
      if (payload.type !== "portfolio-performance-refresh-started" && payload.type !== "portfolio-chart-refresh-started") return;
      setPerformanceRefreshing(true);
      if (refreshGuardTimer.current) window.clearTimeout(refreshGuardTimer.current);
      refreshGuardTimer.current = window.setTimeout(() => { setPerformanceRefreshing(false); }, 45_000);
    },
    reload: () =>
      api.positionsPerformance(range)
        .then((items) => {
          setPerformanceById(new Map(items.map((item) => [item.id, item])));
          setPerformanceRefreshing(false);
        })
        .catch((caughtError: unknown) => {
          setPerformanceError(caughtError instanceof Error ? caughtError.message : t("positionRows.performanceUnavailable", { ns: "dashboard" }));
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
  const translatedSortOptions = useMemo<SortOption<DashboardSortKey>[]>(
    () => sortOptions.map((option) => ({ ...option, label: t(option.labelKey, { ns: "settings" }) })),
    [t]
  );

  return (
    <SortableSection
      activeDirection={sortDirection}
      activeKey={sortKey}
      className={`card overflow-hidden ${performanceRefreshing ? "stale-refreshing" : ""}`}
      onSortChange={updateSort}
      options={translatedSortOptions}
      title={
        <h2 className="font-semibold">
          <span className="sm:hidden">{t("positionList", { ns: "dashboard" })}</span>
          <span className="hidden sm:inline">{t("positions", { ns: "dashboard" })}</span>
        </h2>
      }
    >
      <PositionRows error={performanceError} performanceById={performanceById} positions={sortedPositions} prive={prive} rangeLabel={rangeLabel} />
    </SortableSection>
  );
}
