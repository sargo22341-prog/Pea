import type { MarketSessionDto, PortfolioTransactionMarker, RangeKey } from "@pea/shared";
import { memo, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Area, ComposedChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { usePriceHistoryChart, type PriceHistoryChartPoint, type PriceHistoryInputPoint } from "../../hooks/usePriceHistoryChart";
import { localIsoDate, normalizeTimeZone, zonedTimeToUtc } from "../../lib/timezone";
import { formatHistoryTick, formatHistoryTooltipLabel } from "./chartAxis";
import { ComparisonChart } from "./ComparisonChart";
import { HistoryTooltip } from "./PriceHistoryTooltip";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";
import { TransactionMarkerOverlay } from "./TransactionMarkers";
import { groupTransactionMarkers, positionMarkerGroups } from "./transactionMarkerUtils";

export { ComparisonChart };
export type { ComparisonSerie } from "./ComparisonChart";

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
  marketSession?: MarketSessionDto;
  transactionMarkers?: PortfolioTransactionMarker[];
  userTimezone?: string;
  hideXAxisTicks?: boolean;
  maskValues?: boolean;
}

export const PriceHistoryChart = memo(function PriceHistoryChart({
  data,
  range,
  currency = "EUR",
  heightClassName = "h-72 w-full",
  margin,
  minTickGap,
  oneDayTooltipFormat = "dateTime",
  baselinePrice,
  marketSession,
  transactionMarkers = [],
  userTimezone,
  hideXAxisTicks = false,
  maskValues = false
}: PriceHistoryChartProps) {
  const { chartData, trend } = usePriceHistoryChart(data, range, baselinePrice);
  const compressTimeAxis = range === "1w" || range === "1m";
  const timeChartData = range === "1d" ? withIntradaySessionPlaceholders(chartData, marketSession) : chartData;
  const renderData = compressTimeAxis ? timeChartData.map((point, index) => ({ ...point, x: index })) : timeChartData;
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
  const id = useId().replace(/:/g, "");
  const chartColor = trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#38bdf8";
  const gradientId = `${id}-${trend}-gradient`;
  const showBaseline = range === "1d" && Number.isFinite(baselinePrice);
  const markerGroups = useMemo(
    () => (range === "1d" ? [] : groupTransactionMarkers(transactionMarkers, chartData, compressTimeAxis)),
    [range, transactionMarkers, chartData, compressTimeAxis]
  );
  const resolveXDate = (value: string | number) => {
    if (!compressTimeAxis) return value;
    const index = Math.round(Number(value));
    return chartData[index]?.date ?? value;
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const containerSize = useElementSize(containerRef);
  const markerOverlayPoints = useMemo(
    () => positionMarkerGroups(markerGroups, xDomain, compressTimeAxis, containerSize.width, margin),
    [compressTimeAxis, containerSize.width, margin, markerGroups, xDomain]
  );

  return (
    <div className={`chart-fade overflow-visible ${heightClassName}`} ref={containerRef}>
      <SafeResponsiveContainer>
        <ComposedChart data={renderData} margin={{ ...margin, bottom: Math.max(margin?.bottom ?? 0, markerGroups.length > 0 ? 34 : 0) }}>
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
            tick={hideXAxisTicks ? false : { fill: "#94a3b8", fontSize: 12 }}
            tickFormatter={(value) => formatHistoryTick(resolveXDate(value), range, userTimezone)}
            tickLine={false}
            ticks={xTicks}
            type="number"
          />
          <YAxis
            yAxisId="value"
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
            content={(props) => (
              <HistoryTooltip
                active={props.active}
                currency={currency}
                label={props.label}
                labelFormatter={(value) =>
                  formatHistoryTooltipLabel(resolveXDate(value), range, oneDayTooltipFormat, userTimezone, marketSession)
                }
                maskValues={maskValues}
                payload={props.payload}
              />
            )}
          />

          {showBaseline && (
            <ReferenceLine
              ifOverflow="extendDomain"
              stroke="#94a3b8"
              strokeDasharray="5 5"
              strokeOpacity={0.7}
              strokeWidth={1.5}
              yAxisId="value"
              y={baselinePrice}
            />
          )}

          <Area
            activeDot={{ r: 4 }}
            connectNulls={false}
            dataKey="value"
            dot={false}
            fill={`url(#${gradientId})`}
            yAxisId="value"
            stroke={chartColor}
            strokeWidth={3}
            type="monotone"
          />
        </ComposedChart>
      </SafeResponsiveContainer>
      {markerOverlayPoints.length > 0 && (
        <TransactionMarkerOverlay currency={currency} maskValues={maskValues} points={markerOverlayPoints} userTimezone={userTimezone} />
      )}
    </div>
  );
});

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ height: 0, width: 0 });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setSize({ height: Math.round(rect.height), width: Math.round(rect.width) });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return size;
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

function chartDataDomain(points: Array<{ date: number; value: number | null }>) {
  const timestamps = points.map((point) => Number(point.date)).filter(Number.isFinite);
  if (timestamps.length === 0) return ["dataMin", "dataMax"] as [string, string];
  return [Math.min(...timestamps), Math.max(...timestamps)] as [number, number];
}

function withIntradaySessionPlaceholders(points: PriceHistoryChartPoint[], marketSession?: MarketSessionDto) {
  if (!marketSession || points.length === 0) return points;
  const firstTimestamp = points.map((point) => Number(point.date)).find(Number.isFinite);
  if (!firstTimestamp) return points;
  const session = marketSessionDomain(new Date(firstTimestamp), marketSession);
  const byDate = new Map(points.map((point) => [point.date, point]));
  if (!byDate.has(session.open)) byDate.set(session.open, { date: session.open, value: null });
  if (!byDate.has(session.close)) byDate.set(session.close, { date: session.close, value: null });
  return [...byDate.values()].sort((a, b) => a.date - b.date);
}

function getIntradayDomain(points: PriceHistoryInputPoint[] | Array<{ date: number; value: number | null }>, marketSession?: MarketSessionDto) {
  if (!marketSession) return undefined;
  const firstTimestamp = points.map((point) => Number(point.date)).find(Number.isFinite);
  if (!firstTimestamp) return undefined;
  const session = marketSessionDomain(new Date(firstTimestamp), marketSession);
  return [session.open, session.close] as [number, number];
}

function marketSessionDomain(date: Date, marketSession: MarketSessionDto) {
  const timeZone = normalizeTimeZone(marketSession.timezone);
  const day = localIsoDate(date, timeZone);
  return {
    open: zonedTimeToUtc(day, marketSession.open, timeZone).getTime(),
    close: zonedTimeToUtc(day, marketSession.close, timeZone).getTime()
  };
}
