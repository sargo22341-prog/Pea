import type { PortfolioPerformancePoint } from "@pea/shared";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money } from "../lib/format";
import { getTrend } from "../lib/chart";

export function PortfolioChart({
  data,
}: {
  data: PortfolioPerformancePoint[];
}) {
  const chartData = data.map((point) => ({
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
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <AreaChart
          data={data}
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
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
            </linearGradient>

            <linearGradient
              id="portfolioNegativeGradient"
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
            </linearGradient>

            <linearGradient
              id="portfolioNeutralGradient"
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <XAxis dataKey="date" hide />
          <YAxis hide domain={["dataMin", "dataMax"]} />

          <Tooltip
            contentStyle={{
              background: "#10181f",
              border: "1px solid #263844",
              borderRadius: 8,
            }}
            formatter={(value) => money(Number(value))}
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