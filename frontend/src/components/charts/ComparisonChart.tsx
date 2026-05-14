import type { MarketSessionDto, RangeKey } from "@pea/shared";
import { memo, useMemo } from "react";
import { ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import type { PriceHistoryInputPoint } from "../../hooks/usePriceHistoryChart";
import { COMPARE_COLORS } from "./compareColors";
import { buildComparisonData, shouldNormalizeComparisonByPoints } from "./comparisonData";
import { formatHistoryTick, formatHistoryTooltipLabel } from "./chartAxis";
import { asChartTooltipPayload, tooltipNumberValue, type ChartTooltipPayload } from "./rechartsTypes";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";

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
        const val = tooltipNumberValue(entry?.value);
        if (val === undefined) return null;
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
                payload={asChartTooltipPayload(props.payload)}
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
