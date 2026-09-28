import type { ChartOverlayKey, MarketSessionDto, PortfolioTransactionMarker, RangeKey } from "@pea/shared";
import { memo, useId, useRef } from "react";
import { Area, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { useElementSize } from "../../hooks/useElementSize";
import type { PriceHistoryInputPoint } from "../../hooks/usePriceHistoryChart";
import { formatHistoryTick, formatHistoryTooltipLabel } from "./chartAxis";
import { CHART_ANIMATION_MS, MOVING_AVERAGE_COLORS } from "./chartFormat";
import { useChartMarkerModel } from "./chart-markers.helpers";
import { ComparisonChart } from "./comparison/ComparisonChart";
import { HistoryTooltip } from "./PriceHistoryTooltip";
import { asChartTooltipPayload } from "./rechartsTypes";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";
import { TransactionMarkerOverlay } from "./TransactionMarkers";
import { useChartDataModel } from "./useChartDataModel";

export { ComparisonChart };
export type { ComparisonSerie } from "./comparison/ComparisonChart";

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
  baselinePrice?: number | undefined;
  baselineDatetime?: string | undefined;
  marketSession?: MarketSessionDto | undefined;
  transactionMarkers?: PortfolioTransactionMarker[];
  userTimezone?: string | undefined;
  hideXAxisTicks?: boolean;
  maskValues?: boolean;
  /** Moyennes mobiles à tracer ; leurs valeurs sont portées par les points (`ma50`, `ma200`). */
  movingAverages?: readonly { key: ChartOverlayKey; label: string }[];
  /** Niveaux horizontaux (supports, résistances) masqués s'ils sortent de l'échelle affichée. */
  referenceLevels?: readonly { key: string; label: string; value: number; color: string }[];
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
  maskValues = false,
  movingAverages = [],
  referenceLevels = []
}: PriceHistoryChartProps) {
  const { chartData, compressTimeAxis, renderData, resolveXDate, trend, xDataKey, xDomain, xTicks } = useChartDataModel({
    baselinePrice,
    data,
    marketSession,
    range
  });
  const id = useId().replace(/:/g, "");
  const chartColor = trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#38bdf8";
  const gradientId = `${id}-${trend}-gradient`;
  const showBaseline = range === "1d" && baselinePrice !== undefined && Number.isFinite(baselinePrice);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerSize = useElementSize(containerRef);
  const { markerGroups, markerOverlayPoints } = useChartMarkerModel({
    chartData,
    compressTimeAxis,
    containerWidth: containerSize.width,
    margin,
    range,
    transactionMarkers,
    xDomain
  });

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
            {...(minTickGap === undefined ? {} : { minTickGap })}
            scale={compressTimeAxis ? "linear" : "time"}
            tick={hideXAxisTicks ? false : { fill: "#94a3b8", fontSize: 12 }}
            tickFormatter={(value: string | number) => formatHistoryTick(resolveXDate(value), range, userTimezone)}
            tickLine={false}
            {...(xTicks ? { ticks: xTicks } : {})}
            type="number"
          />
          <YAxis
            yAxisId="value"
            hide
            domain={[
              (dataMin: number) => (showBaseline ? Math.min(dataMin, baselinePrice) : dataMin),
              (dataMax: number) => (showBaseline ? Math.max(dataMax, baselinePrice) : dataMax)
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
                movingAverages={movingAverages}
                payload={asChartTooltipPayload(props.payload)}
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
          {referenceLevels.map((level) => (
            <ReferenceLine
              ifOverflow="discard"
              key={level.key}
              label={{ value: level.label, position: "insideTopLeft", fill: level.color, fontSize: 11 }}
              stroke={level.color}
              strokeDasharray="2 4"
              strokeOpacity={0.8}
              yAxisId="value"
              y={level.value}
            />
          ))}
          {movingAverages.map((average) => (
            <Line
              animationDuration={CHART_ANIMATION_MS}
              connectNulls
              dataKey={average.key}
              dot={false}
              key={average.key}
              stroke={MOVING_AVERAGE_COLORS[average.key]}
              strokeDasharray="6 4"
              strokeWidth={1.5}
              type="monotone"
              yAxisId="value"
            />
          ))}
        </ComposedChart>
      </SafeResponsiveContainer>
      {markerOverlayPoints.length > 0 && (
        <TransactionMarkerOverlay currency={currency} maskValues={maskValues} points={markerOverlayPoints} userTimezone={userTimezone} />
      )}
    </div>
  );
});
