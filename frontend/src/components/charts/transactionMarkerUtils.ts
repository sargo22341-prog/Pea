import type { PortfolioTransactionMarker } from "@pea/shared";

export type MarkerGroupPoint = {
  date: number;
  x?: number;
  markers: PortfolioTransactionMarker[];
};

export type MarkerOverlayPoint = MarkerGroupPoint & {
  left: number;
};

export function groupTransactionMarkers(markers: PortfolioTransactionMarker[], chartData: Array<{ date: number; value: number | null }>, compressTimeAxis: boolean): MarkerGroupPoint[] {
  const indexByTimestamp = new Map(chartData.map((point, index) => [point.date, index]));
  const groups = new Map<number, PortfolioTransactionMarker[]>();

  for (const marker of markers) {
    const timestamp = Number(marker.nearestChartPointDatetime);
    if (!Number.isFinite(timestamp)) continue;
    groups.set(timestamp, [...(groups.get(timestamp) ?? []), marker]);
  }

  return [...groups.entries()]
    .map(([timestamp, group]) => ({
      date: timestamp,
      x: compressTimeAxis ? indexByTimestamp.get(timestamp) : undefined,
      markers: group
    }))
    .filter((group) => !compressTimeAxis || group.x != null)
    .sort((a, b) => a.date - b.date);
}

export function positionMarkerGroups(
  groups: MarkerGroupPoint[],
  xDomain: number[] | [string, string],
  compressTimeAxis: boolean,
  containerWidth: number,
  margin?: { left?: number; right?: number }
): MarkerOverlayPoint[] {
  if (!containerWidth || groups.length === 0) return [];
  const domainMin = Number(xDomain[0]);
  const domainMax = Number(xDomain[1]);
  if (!Number.isFinite(domainMin) || !Number.isFinite(domainMax) || domainMax <= domainMin) return [];

  const leftMargin = margin?.left ?? 0;
  const rightMargin = margin?.right ?? 0;
  const plotWidth = Math.max(containerWidth - leftMargin - rightMargin, 1);

  return groups.map((group) => {
    const xValue = compressTimeAxis ? group.x : group.date;
    const ratio = (Number(xValue) - domainMin) / (domainMax - domainMin);
    const left = Math.min(Math.max(leftMargin + ratio * plotWidth, 12), containerWidth - 12);
    return { ...group, left };
  });
}
