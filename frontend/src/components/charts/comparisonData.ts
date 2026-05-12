import type { RangeKey } from "@pea/shared";
import type { PriceHistoryInputPoint } from "../../hooks/usePriceHistoryChart";
import { normalizeSeriesByPoints } from "../../lib/seriesNormalization";
import type { ComparisonSerie } from "./PriceHistoryChart";

function normalizeRelative(points: PriceHistoryInputPoint[]): { date: number; value: number | null }[] {
  const base = points.find((p) => p.value != null)?.value;
  if (base == null || base === 0) return points.map((p) => ({ date: new Date(p.date).getTime(), value: null }));
  return points.map((p) => ({
    date: new Date(p.date).getTime(),
    value: p.value != null ? ((p.value - base) / base) * 100 : null
  }));
}

export function shouldNormalizeComparisonByPoints(range: RangeKey) {
  return range === "1d" || range === "1w" || range === "1m";
}

export function buildComparisonData(
  main: PriceHistoryInputPoint[],
  comparisons: ComparisonSerie[],
  range: RangeKey
): Array<Record<string, number | null>> {
  if (shouldNormalizeComparisonByPoints(range)) {
    const normalized = normalizeSeriesByPoints([main, ...comparisons.map((c) => c.points)]);
    const normalizedMain = normalized[0] ?? [];
    const normalizedComparisons = comparisons.map((comparison, index) => ({
      key: comparison.symbol,
      data: normalized[index + 1] ?? []
    }));

    return normalizedMain.map((point, index) => {
      const merged: Record<string, number | null> = {
        date: new Date(point.date ?? index).getTime(),
        x: index,
        main: point.value
      };

      for (const comparison of normalizedComparisons) {
        merged[comparison.key] = comparison.data[index]?.value ?? null;
      }

      return merged;
    });
  }

  const normMain = normalizeRelative(main);
  const normComps = comparisons.map((c) => ({ key: c.symbol, data: normalizeRelative(c.points) }));

  const allTimestamps = new Set<number>();
  normMain.forEach((p) => allTimestamps.add(p.date));
  normComps.forEach((c) => c.data.forEach((p) => allTimestamps.add(p.date)));

  const sorted = [...allTimestamps].sort((a, b) => a - b);
  const mainMap = new Map(normMain.map((p) => [p.date, p.value]));
  const compMaps = normComps.map((c) => ({ key: c.key, map: new Map(c.data.map((p) => [p.date, p.value])) }));

  return sorted.map((date) => {
    const point: Record<string, number | null> = { date, main: mainMap.get(date) ?? null };
    for (const { key, map } of compMaps) {
      point[key] = map.get(date) ?? null;
    }
    return point;
  });
}
