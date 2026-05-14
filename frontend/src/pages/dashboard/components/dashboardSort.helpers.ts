import type { DashboardSortKey, PositionRangePerformance, PositionWithMarket, SortDirection, WatchlistItem, WatchlistSortKey } from "@pea/shared";

export type WatchlistMetrics = {
  performancePercent: number | undefined;
  performanceValue: number | undefined;
  price: number | undefined;
};

export function sortPositions(
  positions: PositionWithMarket[],
  sortKey: DashboardSortKey,
  sortDirection: SortDirection,
  performanceById: Map<number, PositionRangePerformance>
) {
  return [...positions].sort((a, b) => {
    const direction = sortDirection === "asc" ? 1 : -1;
    if (sortKey === "name") return a.name.localeCompare(b.name, "fr") * direction;
    const comparison = positionSortValue(a, sortKey, performanceById) - positionSortValue(b, sortKey, performanceById);
    return comparison === 0 ? a.name.localeCompare(b.name, "fr") : comparison * direction;
  });
}

export function sortWatchlistItems(items: WatchlistItem[], sortKey: WatchlistSortKey, sortDirection: SortDirection) {
  return items
    .map((item) => ({ item, metrics: watchlistMetrics(item) }))
    .sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      if (sortKey === "name") return a.item.name.localeCompare(b.item.name, "fr") * direction;
      return (metricValue(a.metrics[sortKey]) - metricValue(b.metrics[sortKey])) * direction;
    });
}

export function watchlistCacheVersion(items: WatchlistItem[]) {
  return items
    .map((item) => {
      const lastPoint = item.history[item.history.length - 1];
      return `${item.symbol}:${item.history.length}:${lastPoint?.date ?? "none"}`;
    })
    .sort()
    .join("|");
}

function positionSortValue(basePosition: PositionWithMarket, key: DashboardSortKey, performanceById: Map<number, PositionRangePerformance>) {
  const rangePerformance = performanceById.get(basePosition.id);
  if (key === "currentMarketValue") return rangePerformance?.currentMarketValue ?? basePosition.marketValue;
  return rangePerformance?.intervalPerformancePercent ?? basePosition.performancePercent;
}

function watchlistMetrics(item: WatchlistItem): WatchlistMetrics {
  const first = item.history[0]?.close;
  const last = item.history[item.history.length - 1]?.close ?? item.quote?.price;

  const performanceValue =
    Number.isFinite(first) && Number.isFinite(last)
      ? Number(last) - Number(first)
      : item.quote?.change;

  const performancePercent =
    Number.isFinite(first) && first
      ? ((Number(last) - Number(first)) / Number(first)) * 100
      : item.quote?.changePercent;

  return {
    price: item.quote?.price,
    performanceValue,
    performancePercent
  };
}

function metricValue(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : Number.NEGATIVE_INFINITY;
}
