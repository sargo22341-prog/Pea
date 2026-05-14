import type { PortfolioTransactionMarker, RangeKey } from "@pea/shared";
import { useMemo } from "react";
import type { PriceHistoryChartPoint } from "../../hooks/usePriceHistoryChart";
import { groupTransactionMarkers, positionMarkerGroups } from "./transactionMarkerUtils";

export function useChartMarkerModel({
  chartData,
  compressTimeAxis,
  containerWidth,
  margin,
  range,
  transactionMarkers,
  xDomain
}: {
  chartData: PriceHistoryChartPoint[];
  compressTimeAxis: boolean;
  containerWidth: number;
  margin?: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };
  range: RangeKey;
  transactionMarkers: PortfolioTransactionMarker[];
  xDomain: [number, number] | [string, string];
}) {
  const markerGroups = useMemo(
    () => (range === "1d" ? [] : groupTransactionMarkers(transactionMarkers, chartData, compressTimeAxis)),
    [range, transactionMarkers, chartData, compressTimeAxis]
  );
  const markerOverlayPoints = useMemo(
    () => positionMarkerGroups(markerGroups, xDomain, compressTimeAxis, containerWidth, margin),
    [compressTimeAxis, containerWidth, margin, markerGroups, xDomain]
  );

  return { markerGroups, markerOverlayPoints };
}
