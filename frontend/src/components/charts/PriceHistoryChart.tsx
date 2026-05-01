import type { MarketSessionDto, PortfolioTransactionMarker, RangeKey } from "@pea/shared";
import { useId } from "react";
import { Area, ComposedChart, Customized, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { TooltipProps } from "recharts/types/component/Tooltip";
import { usePriceHistoryChart, type PriceHistoryInputPoint } from "../../hooks/usePriceHistoryChart";
import { formatChartDate, formatChartDateTime, formatChartTime, formatChartWeekTick, formatNumber, money } from "../../lib/format";
import { localIsoDate, normalizeTimeZone, zonedTimeToUtc } from "../../lib/timezone";

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
}

type MarkerGroupPoint = {
  date: number;
  x?: number;
  markers: PortfolioTransactionMarker[];
};

type ChartOffset = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CustomizedChartProps = {
  offset?: ChartOffset;
  xAxisMap?: Record<string, { scale?: (value: number) => number }>;
};

export function PriceHistoryChart({
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
  userTimezone
}: PriceHistoryChartProps) {
  const { chartData, trend } = usePriceHistoryChart(data, range);
  const compressTimeAxis = range === "1w" || range === "1m";
  const renderData = compressTimeAxis ? chartData.map((point, index) => ({ ...point, x: index })) : chartData;
  const xDataKey = compressTimeAxis ? "x" : "date";
  const xDomain = compressTimeAxis ? [0, Math.max(renderData.length - 1, 0)] : range === "1d" ? getIntradayDomain(chartData, marketSession) ?? chartDataDomain(chartData) : chartDataDomain(chartData);
  const xTicks = compressTimeAxis ? compressedTicks(renderData.length, range) : undefined;
  const id = useId().replace(/:/g, "");
  const chartColor = trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#38bdf8";
  const gradientId = `${id}-${trend}-gradient`;
  const showBaseline = range === "1d" && Number.isFinite(baselinePrice);
  const markerGroups = range === "1d" ? [] : groupTransactionMarkers(transactionMarkers, chartData, compressTimeAxis);
  const markerGroupsByX = new Map(markerGroups.map((group) => [String(compressTimeAxis ? group.x : group.date), group.markers]));
  const resolveXDate = (value: string | number) => {
    if (!compressTimeAxis) return value;
    const index = Math.round(Number(value));
    return chartData[index]?.date ?? value;
  };

  return (
    <div className={`chart-fade ${heightClassName}`}>
      <ResponsiveContainer>
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
            tick={{ fill: "#94a3b8", fontSize: 12 }}
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
                labelFormatter={(value) => formatHistoryTooltipLabel(resolveXDate(value), range, oneDayTooltipFormat, userTimezone, marketSession)}
                markerGroupsByX={markerGroupsByX}
                payload={props.payload}
                userTimezone={userTimezone}
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
          {markerGroups.length > 0 && (
            <Customized
              component={(props: CustomizedChartProps) => (
                <TransactionMarkerLabels groups={markerGroups} xDataKey={xDataKey} {...props} />
              )}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function groupTransactionMarkers(markers: PortfolioTransactionMarker[], chartData: Array<{ date: number; value: number | null }>, compressTimeAxis: boolean): MarkerGroupPoint[] {
  const indexByTimestamp = new Map(chartData.map((point, index) => [point.date, index]));
  const groups = new Map<number, PortfolioTransactionMarker[]>();

  for (const marker of markers) {
    const timestamp = Number(marker.nearestChartPointDatetime);
    if (!Number.isFinite(timestamp)) continue;
    groups.set(timestamp, [...(groups.get(timestamp) ?? []), marker]);
  }

  return [...groups.entries()]
    .map(([timestamp, group]) => ({
      date: timestamp,
      x: compressTimeAxis ? indexByTimestamp.get(timestamp) : undefined,
      markers: group
    }))
    .filter((group) => !compressTimeAxis || group.x != null)
    .sort((a, b) => a.date - b.date);
}

function TransactionMarkerLabels({
  groups,
  offset,
  xAxisMap,
  xDataKey
}: CustomizedChartProps & {
  groups: MarkerGroupPoint[];
  xDataKey: "date" | "x";
}) {
  const xScale = xAxisMap?.[0]?.scale;
  if (!offset || !xScale) return null;
  const labelY = offset.top + offset.height + 17;

  return (
    <g>
      {groups.map((group) => {
        const xValue = xDataKey === "x" ? group.x : group.date;
        const centerX = Number(xValue == null ? NaN : xScale(Number(xValue)));
        if (!Number.isFinite(centerX)) return null;
        return <TransactionMarkerLabelGroup centerX={centerX} centerY={labelY} group={group} key={group.date} />;
      })}
    </g>
  );
}

function TransactionMarkerLabelGroup({
  centerX,
  centerY,
  group
}: {
  centerX: number;
  centerY: number;
  group: MarkerGroupPoint;
}) {
  const markers = group.markers;
  const visibleMarkers = markers.slice(0, 3);
  const extraCount = markers.length - visibleMarkers.length;

  return (
    <g>
      {visibleMarkers.map((marker, index) => {
        const x = centerX + index * 4;
        const y = centerY;
        const tone = marker.type === "buy" ? "#22c55e8f" : "#ef444465";
        return (
          <g key={marker.id}>
            <circle cx={x} cy={y} fill="#071014" r={12} stroke={tone} strokeWidth={1.5} />
            <image
              height={16}
              href={marker.logoUrl ?? `/api/assets/${encodeURIComponent(marker.symbol)}/icon`}
              preserveAspectRatio="xMidYMid meet"
              width={16}
              x={x - 8}
              xlinkHref={marker.logoUrl ?? `/api/assets/${encodeURIComponent(marker.symbol)}/icon`}
              y={y - 8}
            />
          </g>
        );
      })}
      {extraCount > 0 && (
        <g>
          <circle cx={centerX + visibleMarkers.length * 4} cy={centerY} fill="#071014" r={12} stroke="#94a3b8" strokeWidth={1.5} />
          <text fill="#cbd5e1" fontSize={9} fontWeight={700} textAnchor="middle" x={centerX + visibleMarkers.length * 4} y={centerY + 3}>
            +{extraCount}
          </text>
        </g>
      )}
    </g>
  );
}

function HistoryTooltip({
  active,
  payload,
  label,
  currency,
  labelFormatter,
  markerGroupsByX,
  userTimezone
}: Pick<TooltipProps<ValueType, NameType>, "active" | "payload" | "label"> & {
  currency: string;
  labelFormatter: (value: string | number) => string;
  markerGroupsByX: Map<string, PortfolioTransactionMarker[]>;
  userTimezone?: string;
}) {
  if (!active) return null;
  const valuePayload = payload?.find((item) => item.dataKey === "value");
  const markerPayload = payload?.find((item) => item.name === "Transactions");
  const markersFromPayload = markerPayload?.payload && Array.isArray((markerPayload.payload as MarkerGroupPoint).markers)
    ? (markerPayload.payload as MarkerGroupPoint).markers
    : undefined;
  const markers = markersFromPayload ?? markerGroupsByX.get(String(label)) ?? [];

  return (
    <div className="rounded-lg border-0 bg-ink/80 p-3 text-xs text-slate-200 shadow-lg backdrop-blur">
      <p className="mb-2 font-medium text-slate-300">{labelFormatter(typeof label === "number" || typeof label === "string" ? label : "")}</p>
      {valuePayload?.value != null && <p className="mb-2 text-slate-100">{money(Number(valuePayload.value), currency)}</p>}
      {markers.length > 0 && (
        <div className="space-y-2">
          {markers.map((marker) => {
            const isBuy = marker.type === "buy";
            return (
              <div className="flex gap-2" key={marker.id}>
                <img alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-md object-contain p-0.5" src={marker.logoUrl ?? `/api/assets/${encodeURIComponent(marker.symbol)}/icon`} />
                <div>
                  <p className="font-medium text-slate-100">{marker.name}</p>
                  <p className={isBuy ? "text-emerald-400" : "text-red-400"}>
                    {isBuy ? "+" : "-"} {formatNumber(marker.quantity)} {marker.symbol}
                  </p>
                  <p className="text-slate-400">
                    {isBuy ? "Achat" : "Vente"}{marker.price == null ? "" : ` a ${money(marker.price, currency)}`} · {formatChartDateTime(marker.transactionDate, userTimezone)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
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

function chartDataDomain(points: Array<{ date: number; value: number | null }>) {
  const timestamps = points.map((point) => Number(point.date)).filter(Number.isFinite);
  if (timestamps.length === 0) return ["dataMin", "dataMax"] as [string, string];
  return [Math.min(...timestamps), Math.max(...timestamps)] as [number, number];
}

/** Calcule le domaine intraday depuis la session marche exposee par le backend. */
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

function formatHistoryTick(value: string | number, range: RangeKey, userTimezone?: string) {
  const dateValue = chartDateValue(value);
  if (range === "1d") return formatChartTime(dateValue, userTimezone);
  if (range === "1w" || range === "1m") return formatChartWeekTick(dateValue, userTimezone);
  return formatChartDate(dateValue, userTimezone);
}

function formatHistoryTooltipLabel(value: string | number, range: RangeKey, oneDayFormat: "dateTime" | "time", userTimezone?: string, marketSession?: MarketSessionDto) {
  const dateValue = chartDateValue(value);
  if (range === "1d") {
    const userLabel = oneDayFormat === "time" ? formatChartTime(dateValue, userTimezone) : formatChartDateTime(dateValue, userTimezone);
    if (!marketSession || normalizeTimeZone(marketSession.timezone) === normalizeTimeZone(userTimezone)) return userLabel;
    return `${userLabel} | ${formatChartDateTime(dateValue, marketSession.timezone)} (${marketSession.city})`;
  }
  if (range === "1w" || range === "1m") return formatChartDateTime(dateValue, userTimezone);
  return formatChartDate(dateValue, userTimezone);
}

function chartDateValue(value: string | number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Date(numeric).toISOString() : String(value);
}
