import { ReferenceDot } from "recharts";
import { projectionSeries } from "./projectionChartConfig";
import type { ProjectionChartPoint } from "./projectionChartTypes";

export function ObjectiveReachMarker({ label, point }: { label?: string; point?: ProjectionChartPoint }) {
  if (!point?.projected) return null;

  return (
    <ReferenceDot
      fill={projectionSeries.required.color}
      label={{
        value: label,
        position: "top",
        fill: "#f8fafc",
        fontSize: 12
      }}
      r={5}
      stroke="#071014"
      strokeWidth={2}
      x={point.label}
      y={point.projected}
    />
  );
}
