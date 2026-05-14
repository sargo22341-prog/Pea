import type { MarketSessionDto, RangeKey } from "@pea/shared";
import { useMemo } from "react";
import { usePriceHistoryChart, type PriceHistoryInputPoint } from "../../hooks/usePriceHistoryChart";
import { chartDataDomain, compressedTicks } from "./chart-axis.helpers";
import { getIntradayDomain, withIntradaySessionPlaceholders } from "./chart-session.helpers";

export function useChartDataModel({
  baselinePrice,
  data,
  marketSession,
  range
}: {
  baselinePrice?: number;
  data: PriceHistoryInputPoint[];
  marketSession?: MarketSessionDto;
  range: RangeKey;
}) {
  const { chartData, trend } = usePriceHistoryChart(data, range, baselinePrice);
  const compressTimeAxis = range === "1w" || range === "1m";
  const timeChartData = range === "1d" ? withIntradaySessionPlaceholders(chartData, marketSession) : chartData;
  const renderData = useMemo(
    () => (compressTimeAxis ? timeChartData.map((point, index) => ({ ...point, x: index })) : timeChartData),
    [compressTimeAxis, timeChartData]
  );
  const xDataKey = compressTimeAxis ? "x" : "date";
  const xDomain = useMemo(
    () =>
      compressTimeAxis
        ? ([0, Math.max(renderData.length - 1, 0)] as [number, number])
        : range === "1d"
          ? getIntradayDomain(timeChartData, marketSession) ?? chartDataDomain(timeChartData)
          : chartDataDomain(timeChartData),
    [compressTimeAxis, renderData.length, range, timeChartData, marketSession]
  );
  const xTicks = useMemo(
    () => (compressTimeAxis ? compressedTicks(renderData.length, range) : undefined),
    [compressTimeAxis, renderData.length, range]
  );

  function resolveXDate(value: string | number) {
    if (!compressTimeAxis) return value;
    const index = Math.round(Number(value));
    return timeChartData[index]?.date ?? value;
  }

  return {
    chartData,
    compressTimeAxis,
    renderData,
    resolveXDate,
    timeChartData,
    trend,
    xDataKey,
    xDomain,
    xTicks
  };
}
