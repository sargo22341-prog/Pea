import type { ProjectionChartPoint } from "./projectionChartTypes";

export function findReachPoint(data: ProjectionChartPoint[]) {
  return data.find((point) =>
    point.projected !== undefined &&
    point.objective !== undefined &&
    point.projected >= point.objective
  );
}
