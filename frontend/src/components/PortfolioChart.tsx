import type { PortfolioPerformancePoint, RangeKey } from "@pea/shared";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatChartDate, formatChartDateTime, formatChartTime, formatChartWeekTick, money } from "../lib/format";
import { getTrend, normalizePortfolioPerformanceData } from "../lib/chart";

export function PortfolioChart({
  data,
  range,
}: {
  data: PortfolioPerformancePoint[];
  range: RangeKey;
}) {
  const normalizedData = normalizePortfolioPerformanceData(data);
  const chartData = normalizedData.map((point) => ({
    date: point.date,
    close: point.value,
    value: point.value,
  }));

  const trend = getTrend(chartData);

  const chartColor =
    trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#38bdf8";

  const gradientId =
    trend === "up"
      ? "portfolioPositiveGradient"
      : trend === "down"
        ? "portfolioNegativeGradient"
        : "portfolioNeutralGradient";

  return (
    <div className="chart-fade h-72 w-full">
      <ResponsiveContainer>
        <AreaChart
          data={normalizedData}
          margin={{ left: 0, right: 0, top: 16, bottom: 0 }}
        >
          <defs>
            <linearGradient
              id="portfolioPositiveGradient"
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>

            <linearGradient
              id="portfolioNegativeGradient"
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>

            <linearGradient
              id="portfolioNeutralGradient"
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.08} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="date"
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            tickFormatter={(value) => {
              if (range === "1d") return formatChartTime(String(value));
              if (range === "1w" || range === "1m") return formatChartWeekTick(String(value));
              return formatChartDate(String(value));
            }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis hide domain={["dataMin", "dataMax"]} />

          <Tooltip
            contentStyle={{
              background: "rgba(7, 16, 20, 0.72)",
              border: "0",
              borderRadius: 8,
              backdropFilter: "blur(6px)",
            }}
            formatter={(value) => money(Number(value))}
            labelFormatter={(value) => {
              if (range === "1d") return formatChartTime(String(value));
              if (range === "1w" || range === "1m") return formatChartDateTime(String(value));
              return formatChartDate(String(value));
            }}
            labelStyle={{ color: "#cbd5e1" }}
          />

          <Area
            dataKey="value"
            stroke={chartColor}
            strokeWidth={3}
            fill={`url(#${gradientId})`}
            type="monotone"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
