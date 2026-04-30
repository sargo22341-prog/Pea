import type { RangeKey } from "@pea/shared";
import { useId } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePriceHistoryChart, type PriceHistoryInputPoint } from "../../hooks/usePriceHistoryChart";
import { formatChartDate, formatChartDateTime, formatChartTime, formatChartWeekTick, money } from "../../lib/format";

interface PriceHistoryChartProps {
  data: PriceHistoryInputPoint[];
  range: RangeKey;
  currency?: string;
  heightClassName?: string;
  margin?: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };
  minTickGap?: number;
  oneDayTooltipFormat?: "dateTime" | "time";
  baselinePrice?: number;
  baselineDatetime?: string;
}

export function PriceHistoryChart({
  data,
  range,
  currency = "EUR",
  heightClassName = "h-72 w-full",
  margin,
  minTickGap,
  oneDayTooltipFormat = "dateTime",
  baselinePrice
}: PriceHistoryChartProps) {
  const { chartData, trend } = usePriceHistoryChart(data, range);
  const id = useId().replace(/:/g, "");
  const chartColor = trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#38bdf8";
  const gradientId = `${id}-${trend}-gradient`;
  const showBaseline = range === "1d" && Number.isFinite(baselinePrice);

  return (
    <div className={`chart-fade ${heightClassName}`}>
      <ResponsiveContainer>
        <AreaChart data={chartData} margin={margin}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={chartColor} stopOpacity={trend === "neutral" ? 0.08 : 0} />
              <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis
            axisLine={false}
            dataKey="date"
            minTickGap={minTickGap}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            tickFormatter={(value) => formatHistoryTick(String(value), range)}
            tickLine={false}
          />
          <YAxis
            hide
            domain={[
              (dataMin: number) => (showBaseline ? Math.min(dataMin, Number(baselinePrice)) : dataMin),
              (dataMax: number) => (showBaseline ? Math.max(dataMax, Number(baselinePrice)) : dataMax)
            ]}
          />

          <Tooltip
            contentStyle={{
              background: "rgba(7, 16, 20, 0.72)",
              border: "0",
              borderRadius: 8,
              backdropFilter: "blur(6px)"
            }}
            formatter={(value) => (value == null ? "" : money(Number(value), currency))}
            labelFormatter={(value) => formatHistoryTooltipLabel(String(value), range, oneDayTooltipFormat)}
            labelStyle={{ color: "#cbd5e1" }}
          />

          {showBaseline && (
            <ReferenceLine
              ifOverflow="extendDomain"
              stroke="#94a3b8"
              strokeDasharray="5 5"
              strokeOpacity={0.7}
              strokeWidth={1.5}
              y={baselinePrice}
            />
          )}

          <Area
            activeDot={{ r: 4 }}
            connectNulls={false}
            dataKey="value"
            dot={false}
            fill={`url(#${gradientId})`}
            stroke={chartColor}
            strokeWidth={3}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatHistoryTick(value: string, range: RangeKey) {
  if (range === "1d") return formatChartTime(value);
  if (range === "1w" || range === "1m") return formatChartWeekTick(value);
  return formatChartDate(value);
}

function formatHistoryTooltipLabel(value: string, range: RangeKey, oneDayFormat: "dateTime" | "time") {
  if (range === "1d") return oneDayFormat === "time" ? formatChartTime(value) : formatChartDateTime(value);
  if (range === "1w" || range === "1m") return formatChartDateTime(value);
  return formatChartDate(value);
}
