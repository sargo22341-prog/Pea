import type { MarketSessionDto, PortfolioTransactionMarker, RangeKey } from "@pea/shared";
import { memo, useId, useRef } from "react";
import { Area, ComposedChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { useElementSize } from "../../hooks/useElementSize";
import type { PriceHistoryInputPoint } from "../../hooks/usePriceHistoryChart";
import { formatHistoryTick, formatHistoryTooltipLabel } from "./chartAxis";
import { useChartMarkerModel } from "./chart-markers.helpers";
import { ComparisonChart } from "./ComparisonChart";
import { HistoryTooltip } from "./PriceHistoryTooltip";
import { asChartTooltipPayload } from "./rechartsTypes";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";
import { TransactionMarkerOverlay } from "./TransactionMarkers";
import { useChartDataModel } from "./useChartDataModel";

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
  const { chartData, compressTimeAxis, renderData, resolveXDate, trend, xDataKey, xDomain, xTicks } = useChartDataModel({
    baselinePrice,
    data,
    marketSession,
    range
  });
  const id = useId().replace(/:/g, "");
  const chartColor = trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#38bdf8";
  const gradientId = `${id}-${trend}-gradient`;
  const showBaseline = range === "1d" && Number.isFinite(baselinePrice);
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
        </ComposedChart>
      </SafeResponsiveContainer>
      {markerOverlayPoints.length > 0 && (
        <TransactionMarkerOverlay currency={currency} maskValues={maskValues} points={markerOverlayPoints} userTimezone={userTimezone} />
      )}
    </div>
  );
});
