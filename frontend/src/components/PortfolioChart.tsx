import type { PortfolioPerformancePoint, RangeKey } from "@pea/shared";
import { PriceHistoryChart } from "./charts/PriceHistoryChart";

export function PortfolioChart({
  data,
  range,
}: {
  data: PortfolioPerformancePoint[];
  range: RangeKey;
}) {
  const chartData = data.map((point) => ({
    date: point.date,
    value: point.value
  }));

  return <PriceHistoryChart data={chartData} margin={{ left: 0, right: 0, top: 16, bottom: 0 }} minTickGap={28} oneDayTooltipFormat="time" range={range} />;
}
