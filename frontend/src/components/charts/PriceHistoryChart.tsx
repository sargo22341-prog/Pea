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
  const compressTimeAxis = range === "1w" || range === "1m";
  const renderData = compressTimeAxis ? chartData.map((point, index) => ({ ...point, x: index })) : chartData;
  const xDataKey = compressTimeAxis ? "x" : "date";
  const xDomain = compressTimeAxis ? [0, Math.max(renderData.length - 1, 0)] : range === "1d" ? getIntradayDomain(chartData) : ["dataMin", "dataMax"];
  const xTicks = compressTimeAxis ? compressedTicks(renderData.length, range) : undefined;
  const id = useId().replace(/:/g, "");
  const chartColor = trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#38bdf8";
  const gradientId = `${id}-${trend}-gradient`;
  const showBaseline = range === "1d" && Number.isFinite(baselinePrice);
  const resolveXDate = (value: string | number) => {
    if (!compressTimeAxis) return value;
    const index = Math.round(Number(value));
    return chartData[index]?.date ?? value;
  };

  return (
    <div className={`chart-fade ${heightClassName}`}>
      <ResponsiveContainer>
        <AreaChart data={renderData} margin={margin}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={chartColor} stopOpacity={trend === "neutral" ? 0.08 : 0} />
              <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis
            axisLine={false}
            dataKey={xDataKey}
            domain={xDomain}
            minTickGap={minTickGap}
            scale={compressTimeAxis ? "linear" : "time"}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            tickFormatter={(value) => formatHistoryTick(resolveXDate(value), range)}
            tickLine={false}
            ticks={xTicks}
            type="number"
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
            labelFormatter={(value) => formatHistoryTooltipLabel(resolveXDate(value), range, oneDayTooltipFormat)}
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

function compressedTicks(length: number, range: RangeKey) {
  if (length <= 0) return [];
  if (range === "1w") return Array.from({ length }, (_, index) => index);
  const targetTickCount = 6;
  if (length <= targetTickCount) return Array.from({ length }, (_, index) => index);
  const lastIndex = length - 1;
  const ticks = new Set<number>();
  for (let index = 0; index < targetTickCount; index += 1) {
    ticks.add(Math.round((index * lastIndex) / (targetTickCount - 1)));
  }
  return [...ticks].sort((a, b) => a - b);
}

function getIntradayDomain(points: PriceHistoryInputPoint[] | Array<{ date: number; value: number | null }>) {
  const firstTimestamp = points.map((point) => Number(point.date)).find(Number.isFinite);
  if (!firstTimestamp) return undefined;
  const session = parisSessionDomain(new Date(firstTimestamp));
  return [session.open, session.close] as [number, number];
}

function parisSessionDomain(date: Date) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  return {
    open: zonedTimeToUtc(day, "09:00", "Europe/Paris").getTime(),
    close: zonedTimeToUtc(day, "17:30", "Europe/Paris").getTime()
  };
}

function zonedTimeToUtc(day: string, time: string, timeZone: string) {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date, hour, minute));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(utc);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const observedAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(utc.getTime() - (observedAsUtc - utc.getTime()));
}

function formatHistoryTick(value: string | number, range: RangeKey) {
  const dateValue = chartDateValue(value);
  if (range === "1d") return formatChartTime(dateValue);
  if (range === "1w" || range === "1m") return formatChartWeekTick(dateValue);
  return formatChartDate(dateValue);
}

function formatHistoryTooltipLabel(value: string | number, range: RangeKey, oneDayFormat: "dateTime" | "time") {
  const dateValue = chartDateValue(value);
  if (range === "1d") return oneDayFormat === "time" ? formatChartTime(dateValue) : formatChartDateTime(dateValue);
  if (range === "1w" || range === "1m") return formatChartDateTime(dateValue);
  return formatChartDate(dateValue);
}

function chartDateValue(value: string | number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Date(numeric).toISOString() : String(value);
}
