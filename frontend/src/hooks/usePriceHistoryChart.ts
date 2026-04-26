import type { RangeKey } from "@pea/shared";
import { useMemo } from "react";

export type PriceHistoryInputPoint = {
  date: string;
  value?: number | null;
};

export type PriceHistoryChartPoint = {
  date: string;
  value: number | null;
};

export function usePriceHistoryChart(points: PriceHistoryInputPoint[], range: RangeKey) {
  const chartData = useMemo(() => normalizePriceHistoryPoints(points), [points]);
  const validPoints = useMemo(
    () => chartData.filter((point): point is { date: string; value: number } => point.value != null),
    [chartData]
  );

  const firstValue = validPoints[0]?.value;
  const lastValue = validPoints[validPoints.length - 1]?.value;
  const change = firstValue != null && lastValue != null ? lastValue - firstValue : 0;
  const changePercent = firstValue != null && lastValue != null && firstValue !== 0 ? (change / firstValue) * 100 : 0;
  const trend = firstValue == null || lastValue == null ? "neutral" : lastValue > firstValue ? "up" : lastValue < firstValue ? "down" : "neutral";

  return {
    range,
    chartData,
    validPoints,
    firstValue,
    lastValue,
    change,
    changePercent,
    trend,
    isPositive: change >= 0
  };
}

export function normalizePriceHistoryPoints(points: PriceHistoryInputPoint[]) {
  const byDate = new Map<string, PriceHistoryChartPoint>();

  for (const point of points) {
    if (!point.date || !Number.isFinite(new Date(point.date).getTime())) continue;
    const value = point.value;
    byDate.set(point.date, {
      date: point.date,
      value: value != null && Number.isFinite(value) ? value : null
    });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
