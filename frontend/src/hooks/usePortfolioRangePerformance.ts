import { useMemo } from "react";
import { normalizePortfolioPerformanceData, type PerformancePoint } from "../lib/chart";

export function usePortfolioRangePerformance(points: PerformancePoint[]) {
  return useMemo(() => {
    const sorted = normalizePortfolioPerformanceData(points);
    const first = sorted[0]?.value;
    const last = sorted[sorted.length - 1]?.value;
    if (!first || !Number.isFinite(first) || !Number.isFinite(last)) return null;
    const value = last - first;
    return { value, percent: (value / first) * 100 };
  }, [points]);
}
