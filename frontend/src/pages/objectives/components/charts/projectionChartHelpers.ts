import type { ObjectiveSeriesPoint } from "@pea/shared";
import type { ObjectiveChartRange } from "../../types";
import type { ProjectionChartPoint } from "./projectionChartTypes";

const monthsByRange: Record<ObjectiveChartRange, number> = {
  "1y": 12,
  "5y": 60,
  all: Number.POSITIVE_INFINITY
};

export function findReachPoint(data: ProjectionChartPoint[]) {
  return data.find((point) =>
    point.projected !== undefined &&
    point.objective !== undefined &&
    point.projected >= point.objective
  );
}

/** Limite la serie a la plage choisie et prepare les points du graphique. */
export function buildProjectionChartData(series: ObjectiveSeriesPoint[], range: ObjectiveChartRange): ProjectionChartPoint[] {
  const limit = monthsByRange[range];
  const firstFutureIndex = series.findIndex((point) => point.projected !== undefined);
  return series
    .filter((_, index) => firstFutureIndex < 0 || index < firstFutureIndex || index - firstFutureIndex <= limit)
    .map((point) => ({
      ...point,
      label: point.age ? `${Math.round(point.age)} ans` : new Date(point.date).getFullYear().toString(),
      projectedRange: point.projectedLow !== undefined && point.projectedHigh !== undefined
        ? [point.projectedLow, point.projectedHigh]
        : undefined
    }));
}

export function hasProjectionRange(data: ProjectionChartPoint[]) {
  return data.some((point) => point.projectedRange !== undefined);
}
