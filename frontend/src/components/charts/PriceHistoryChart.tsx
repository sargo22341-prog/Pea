/**
 * Role du fichier : graphique de prix generique utilise pour les actifs et le portefeuille.
 * React.memo evite les re-renders quand le parent change sans que les props du chart bougent,
 * ce qui est frequent lors des changements de plage ou de l'etat de chargement du dashboard.
 */
import type { MarketSessionDto, PortfolioTransactionMarker, RangeKey } from "@pea/shared";
import { memo, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Area, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { usePriceHistoryChart, type PriceHistoryChartPoint, type PriceHistoryInputPoint } from "../../hooks/usePriceHistoryChart";
import { formatChartDate, formatChartDateTime, formatChartTime, formatChartWeekTick, formatNumber, money } from "../../lib/format";
import { localIsoDate, normalizeTimeZone, zonedTimeToUtc } from "../../lib/timezone";
import { masquerValeur } from "../../lib/privacy";
import { COMPARE_COLORS } from "./compareColors";
import { buildComparisonData, shouldNormalizeComparisonByPoints } from "./comparisonData";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";

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
  /** Quand vrai, masque les montants dans le tooltip (mode privé sur le chart portefeuille). */
  maskValues?: boolean;
}

type MarkerGroupPoint = {
  date: number;
  x?: number;
  markers: PortfolioTransactionMarker[];
};

type MarkerOverlayPoint = MarkerGroupPoint & {
  left: number;
};

type ChartTooltipPayload = ReadonlyArray<{
  dataKey?: string | number | ((obj: unknown) => unknown);
  name?: string | number;
  payload?: unknown;
  value?: unknown;
}>;

type HistoryTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipPayload;
  label?: unknown;
  currency: string;
  labelFormatter: (value: string | number) => string;
  maskValues?: boolean;
};

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
                  formatHistoryTooltipLabel(
                    resolveXDate(value),
                    range,
                    oneDayTooltipFormat,
                    userTimezone,
                    marketSession
                  )
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

function TransactionMarkerOverlay({
  currency,
  points,
  userTimezone,
  maskValues
}: {
  currency: string;
  points: MarkerOverlayPoint[];
  userTimezone?: string;
  maskValues: boolean;
}) {
  const [activePoint, setActivePoint] = useState<MarkerOverlayPoint | null>(null);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 h-8">
      {points.map((point) => (
        <button
          aria-label={`${point.markers.length} transaction${point.markers.length > 1 ? "s" : ""}`}
          className="pointer-events-auto absolute top-1/2 flex h-8 min-w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center border-0 bg-transparent p-0"
          key={point.date}
          onBlur={() => setActivePoint(null)}
          onFocus={() => setActivePoint(point)}
          onMouseEnter={() => setActivePoint(point)}
          onMouseLeave={() => setActivePoint(null)}
          style={{ left: point.left }}
          type="button"
        >
          <TransactionMarkerBadge group={point} />
        </button>
      ))}
      {activePoint && (
        <div
          className="pointer-events-none absolute bottom-10 z-20 max-w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-ink/90 p-3 text-xs text-slate-200 shadow-lg backdrop-blur"
          style={{ left: activePoint.left }}
        >
          <TransactionMarkerTooltip currency={currency} markers={activePoint.markers} maskValues={maskValues} userTimezone={userTimezone} />
        </div>
      )}
    </div>
  );
}

function TransactionMarkerBadge({ group }: { group: MarkerGroupPoint }) {
  const markers = group.markers;
  const visibleMarkers = markers.slice(0, 3);
  const extraCount = markers.length - visibleMarkers.length;

  return (
    <span className="flex items-center">
      {visibleMarkers.map((marker, index) => {
        const tone = marker.type === "buy" ? "border-emerald-500/80" : "border-red-500/70";
        return (
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border bg-ink shadow ${tone}`}
            key={marker.id}
            style={{ marginLeft: index === 0 ? 0 : -7 }}
          >
            <img alt="" className="h-4 w-4 rounded-sm object-contain" src={marker.logoUrl ?? `/api/assets/${encodeURIComponent(marker.symbol)}/icon`} />
          </span>
        );
      })}
      {extraCount > 0 && (
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-400 bg-ink text-[9px] font-bold text-slate-200 shadow"
          style={{ marginLeft: -7 }}
        >
          +{extraCount}
        </span>
      )}
    </span>
  );
}

function TransactionMarkerTooltip({
  currency,
  markers,
  userTimezone,
  maskValues
}: {
  currency: string;
  markers: PortfolioTransactionMarker[];
  userTimezone?: string;
  maskValues: boolean;
}) {
  return (
    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
      {markers.map((marker) => {
        const isBuy = marker.type === "buy";
        return (
          <div className="flex gap-2" key={marker.id}>
            <img alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-md object-contain p-0.5" src={marker.logoUrl ?? `/api/assets/${encodeURIComponent(marker.symbol)}/icon`} />
            <div>
              <p className="font-medium text-slate-100">{marker.name}</p>
              <p className={isBuy ? "text-emerald-400" : "text-red-400"}>
                {isBuy ? "+" : "-"} {masquerValeur(formatNumber(marker.quantity), maskValues)} {marker.symbol}
              </p>
              <p className="text-slate-400">
                {isBuy ? "Achat" : "Vente"}{marker.price == null ? "" : ` a ${masquerValeur(money(marker.price, currency), maskValues)}`} - {formatChartDateTime(marker.transactionDate, userTimezone)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryTooltip({
  active,
  payload,
  label,
  currency,
  labelFormatter,
  maskValues = false
}: HistoryTooltipProps) {
  if (!active) return null;
  const valuePayload = payload?.find((item) => item.dataKey === "value");

  return (
    <div className="rounded-lg border-0 bg-ink/80 p-3 text-xs text-slate-200 shadow-lg backdrop-blur">
      <p className="mb-2 font-medium text-slate-300">{labelFormatter(typeof label === "number" || typeof label === "string" ? label : "")}</p>
      {valuePayload?.value != null && (
        <p className="mb-2 text-slate-100">{masquerValeur(money(Number(valuePayload.value), currency), maskValues)}</p>
      )}
    </div>
  );
}

function positionMarkerGroups(
  groups: MarkerGroupPoint[],
  xDomain: number[] | [string, string],
  compressTimeAxis: boolean,
  containerWidth: number,
  margin?: PriceHistoryChartProps["margin"]
): MarkerOverlayPoint[] {
  if (!containerWidth || groups.length === 0) return [];
  const domainMin = Number(xDomain[0]);
  const domainMax = Number(xDomain[1]);
  if (!Number.isFinite(domainMin) || !Number.isFinite(domainMax) || domainMax <= domainMin) return [];

  const leftMargin = margin?.left ?? 0;
  const rightMargin = margin?.right ?? 0;
  const plotWidth = Math.max(containerWidth - leftMargin - rightMargin, 1);

  return groups.map((group) => {
    const xValue = compressTimeAxis ? group.x : group.date;
    const ratio = (Number(xValue) - domainMin) / (domainMax - domainMin);
    const left = Math.min(Math.max(leftMargin + ratio * plotWidth, 12), containerWidth - 12);
    return { ...group, left };
  });
}

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

// ─── Comparison chart ────────────────────────────────────────────────────────

export interface ComparisonSerie {
  symbol: string;
  name: string;
  points: PriceHistoryInputPoint[];
}

interface ComparisonChartProps {
  data: PriceHistoryInputPoint[];
  comparisonSeries: ComparisonSerie[];
  mainSymbol?: string;
  range: RangeKey;
  heightClassName?: string;
  userTimezone?: string;
  marketSession?: MarketSessionDto;
}

interface ComparisonTooltipEntry {
  key: string;
  label: string;
  color: string;
}

function ComparisonTooltip({
  active,
  payload,
  label,
  series,
  range,
  userTimezone,
  marketSession
}: {
  active?: boolean;
  payload?: ChartTooltipPayload;
  label?: unknown;
  series: ComparisonTooltipEntry[];
  range: RangeKey;
  userTimezone?: string;
  marketSession?: MarketSessionDto;
}) {
  if (!active || !payload?.length || label == null) return null;
  const dateStr = formatHistoryTooltipLabel(Number(label), range, range === "1d" ? "time" : "dateTime", userTimezone, marketSession);
  return (
    <div className="space-y-1 px-1 py-2">
      <p className="mb-2 text-xs text-slate-400">{dateStr}</p>
      {series.map((s) => {
        const entry = payload.find((p) => p.dataKey === s.key);
        const val = Number(entry?.value);
        if (!Number.isFinite(val)) return null;
        return (
          <div key={s.key} className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-slate-300">{s.label}</span>
            <span className="ml-auto pl-4 font-semibold tabular-nums" style={{ color: val >= 0 ? "#22c55e" : "#ef4444" }}>
              {val >= 0 ? "+" : ""}{val.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const ComparisonChart = memo(function ComparisonChart({
  data,
  comparisonSeries,
  mainSymbol,
  range,
  heightClassName = "h-72 w-full",
  userTimezone,
  marketSession
}: ComparisonChartProps) {
  const trend = useMemo(() => {
    const valid = data.filter((p) => p.value != null);
    if (valid.length < 2) return "neutral" as const;
    const first = valid[0].value!;
    const last = valid[valid.length - 1].value!;
    return last > first ? ("up" as const) : last < first ? ("down" as const) : ("neutral" as const);
  }, [data]);

  const mainColor = trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#38bdf8";
  const allSeries: ComparisonTooltipEntry[] = [
    { key: "main", label: mainSymbol ?? "Principal", color: mainColor },
    ...comparisonSeries.map((s, i) => ({ key: s.symbol, label: s.symbol, color: COMPARE_COLORS[i] }))
  ];

  const mergedData = useMemo(() => buildComparisonData(data, comparisonSeries, range), [data, comparisonSeries, range]);
  const usePointAxis = shouldNormalizeComparisonByPoints(range);
  const xDataKey = usePointAxis ? "x" : "date";

  const xDomain = useMemo((): [number, number] | undefined => {
    if (usePointAxis) return [0, Math.max(mergedData.length - 1, 0)];
    const dates = mergedData.map((p) => p.date as number).filter(Number.isFinite);
    if (!dates.length) return undefined;
    return [Math.min(...dates), Math.max(...dates)];
  }, [mergedData, usePointAxis]);

  const resolveXDate = (value: string | number) => {
    if (!usePointAxis) return value;
    const index = Math.round(Number(value));
    return (mergedData[index]?.date as number | undefined) ?? value;
  };

  return (
    <div className={`chart-fade overflow-visible ${heightClassName}`}>
      <SafeResponsiveContainer>
        <ComposedChart data={mergedData}>
          <XAxis
            axisLine={false}
            dataKey={xDataKey}
            domain={xDomain}
            scale={usePointAxis ? "linear" : "time"}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            tickFormatter={(value) => formatHistoryTick(resolveXDate(value), range, userTimezone)}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
            tickLine={false}
            width={52}
          />
          <ReferenceLine stroke="#475569" strokeDasharray="3 3" strokeWidth={1} y={0} />
          <Tooltip
            contentStyle={{ background: "rgba(7, 16, 20, 0.72)", border: "0", borderRadius: 8, backdropFilter: "blur(6px)" }}
            content={(props) => (
              <ComparisonTooltip
                active={props.active}
                label={usePointAxis && (typeof props.label === "number" || typeof props.label === "string") ? resolveXDate(props.label) : props.label}
                marketSession={marketSession}
                payload={props.payload as ChartTooltipPayload}
                range={range}
                series={allSeries}
                userTimezone={userTimezone}
              />
            )}
          />
          {allSeries.map((s) => (
            <Line
              key={s.key}
              activeDot={{ r: 4 }}
              connectNulls
              dataKey={s.key}
              dot={false}
              stroke={s.color}
              strokeWidth={2}
              type="monotone"
            />
          ))}
        </ComposedChart>
      </SafeResponsiveContainer>
      <div className="mt-2 flex flex-wrap items-center gap-3 px-1 text-xs text-slate-400">
        {allSeries.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
});
