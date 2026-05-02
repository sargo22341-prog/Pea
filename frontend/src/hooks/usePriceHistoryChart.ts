import type { RangeKey } from "@pea/shared";
import { useMemo } from "react";

export type PriceHistoryInputPoint = {
  date: string;
  value?: number | null;
};

export type PriceHistoryChartPoint = {
  date: number;
  value: number | null;
};

export function usePriceHistoryChart(points: PriceHistoryInputPoint[], range: RangeKey, baselinePrice?: number) {
  const chartData = useMemo(() => normalizePriceHistoryPoints(points), [points]);
  const validPoints = useMemo(
    () => chartData.filter((point): point is { date: number; value: number } => point.value != null),
    [chartData]
  );

  const firstValue = validPoints[0]?.value;
  const lastValue = validPoints[validPoints.length - 1]?.value;
  const baselineValue = range === "1d" && Number.isFinite(baselinePrice) ? Number(baselinePrice) : firstValue;
  const change = baselineValue != null && lastValue != null ? lastValue - baselineValue : 0;
  const changePercent = baselineValue != null && lastValue != null && baselineValue !== 0 ? (change / baselineValue) * 100 : 0;
  const trend = baselineValue == null || lastValue == null ? "neutral" : lastValue > baselineValue ? "up" : lastValue < baselineValue ? "down" : "neutral";

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
    const timestamp = new Date(point.date).getTime();
    if (!point.date || !Number.isFinite(timestamp)) continue;
    const value = point.value;
    byDate.set(point.date, {
      date: timestamp,
      value: value != null && Number.isFinite(value) ? value : null
    });
  }

  return [...byDate.values()].sort((a, b) => a.date - b.date);
}
