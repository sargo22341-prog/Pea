/**
 * Role du fichier : graphique de comparaison portefeuille vs actifs en base 100.
 * La serie portefeuille reste normalisee via le Time-Weighted Return (TWR) afin
 * que les achats/ventes ne soient pas comptabilises comme de la performance.
 */

import type { PortfolioChartDto, RangeKey } from "@pea/shared";
import { memo, useMemo } from "react";
import { ComposedChart, Legend, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { formatChartDate, formatChartDateTime, formatChartTime, formatChartWeekTick } from "../../lib/format";
import { normalizeSeriesByPoints } from "../../lib/seriesNormalization";
import { COMPARE_COLORS } from "./compareColors";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";

export interface PortfolioComparisonSerie {
  key: string;
  label: string;
  timestamps: number[];
  prices: number[];
}

interface ComparisonPoint extends Record<string, number | null> {
  date: number;
  portfolio: number | null;
}

interface ComparisonEntry {
  key: string;
  label: string;
  color: string;
}

export const PortfolioComparisonChart = memo(function PortfolioComparisonChart({
  chart,
  comparisons,
  range,
  userTimezone,
  maskValues = false
}: {
  chart: PortfolioChartDto;
  comparisons: PortfolioComparisonSerie[];
  range: RangeKey;
  userTimezone?: string;
  maskValues?: boolean;
}) {
  const compressTimeAxis = shouldNormalizeComparisonByPoints(range);
  const comparisonData = useMemo(() => buildComparisonData(chart, comparisons, range), [chart, comparisons, range]);
  const comparisonEntries = useMemo(
    () =>
      comparisons.map((comparison, index) => ({
        key: comparisonDataKey(index),
        label: comparison.label,
        color: COMPARE_COLORS[index % COMPARE_COLORS.length]
      })),
    [comparisons]
  );

  const portfolioColor = useMemo(() => {
    const valid = comparisonData.filter((point): point is ComparisonPoint & { portfolio: number } => point.portfolio != null);
    const first = valid[0]?.portfolio;
    const last = valid[valid.length - 1]?.portfolio;
    if (first == null || last == null) return "#38bdf8";
    return last > first ? "#22c55e" : last < first ? "#ef4444" : "#38bdf8";
  }, [comparisonData]);

  const renderData = compressTimeAxis ? comparisonData.map((point, index) => ({ ...point, x: index })) : comparisonData;
  const xDataKey = compressTimeAxis ? "x" : "date";
  const xDomain: [number, number] | [string, string] = compressTimeAxis
    ? [0, Math.max(comparisonData.length - 1, 0)]
    : comparisonData.length > 0
      ? [comparisonData[0].date, comparisonData[comparisonData.length - 1].date]
      : ["dataMin", "dataMax"];
  const xTicks = compressTimeAxis ? compressedTicks(comparisonData.length, range) : undefined;

  const resolveXDate = (value: string | number) => {
    if (!compressTimeAxis) return value;
    const index = Math.round(Number(value));
    return comparisonData[index]?.date ?? value;
  };

  return (
    <div className="chart-fade h-72 w-full overflow-visible">
      <SafeResponsiveContainer>
        <ComposedChart data={renderData} margin={{ left: 0, right: 0, top: 16, bottom: 0 }}>
          <XAxis
            axisLine={false}
            dataKey={xDataKey}
            domain={xDomain}
            minTickGap={28}
            scale={compressTimeAxis ? "linear" : "time"}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            tickFormatter={(value) => formatComparisonTick(resolveXDate(value), range, userTimezone)}
            tickLine={false}
            ticks={xTicks}
            type="number"
          />

          <YAxis hide domain={["auto", "auto"]} />
          <ReferenceLine ifOverflow="extendDomain" stroke="#94a3b8" strokeDasharray="4 4" strokeOpacity={0.35} strokeWidth={1} y={100} />

          <Tooltip
            content={(props) => (
              <ComparisonTooltip
                active={props.active}
                comparisons={comparisonEntries}
                label={props.label}
                labelFormatter={(value) => formatComparisonTooltipLabel(resolveXDate(value), range, userTimezone)}
                maskValues={maskValues}
                payload={props.payload}
              />
            )}
            contentStyle={{
              background: "rgba(7, 16, 20, 0.72)",
              border: "0",
              borderRadius: 8,
              backdropFilter: "blur(6px)"
            }}
          />

          <Legend
            content={() => (
              <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 pt-1 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-5 rounded" style={{ backgroundColor: portfolioColor }} />
                  Portefeuille
                </span>
                {comparisonEntries.map((entry) => (
                  <span className="flex items-center gap-1.5" key={entry.key}>
                    <span className="inline-block h-0.5 w-5 rounded" style={{ backgroundColor: entry.color }} />
                    {entry.label}
                  </span>
                ))}
              </div>
            )}
          />

          <Line
            activeDot={{ r: 4 }}
            connectNulls={false}
            dataKey="portfolio"
            dot={false}
            isAnimationActive={false}
            stroke={portfolioColor}
            strokeWidth={2.5}
            type="monotone"
          />

          {comparisonEntries.map((entry) => (
            <Line
              activeDot={{ fill: entry.color, r: 4 }}
              connectNulls={false}
              dataKey={entry.key}
              dot={false}
              isAnimationActive={false}
              key={entry.key}
              stroke={entry.color}
              strokeWidth={2}
              type="monotone"
            />
          ))}
        </ComposedChart>
      </SafeResponsiveContainer>
    </div>
  );
});

type TooltipPayloadItem = {
  dataKey?: string | number | ((obj: unknown) => unknown);
  value?: unknown;
};

function ComparisonTooltip({
  active,
  payload,
  label,
  labelFormatter,
  comparisons,
  maskValues
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipPayloadItem>;
  label?: unknown;
  labelFormatter: (value: string | number) => string;
  comparisons: ComparisonEntry[];
  maskValues: boolean;
}) {
  if (!active || !payload?.length) return null;

  const portfolioItem = payload.find((item) => item.dataKey === "portfolio");
  const labelStr = typeof label === "number" || typeof label === "string" ? label : "";

  return (
    <div className="rounded-lg border-0 bg-ink/80 p-3 text-xs text-slate-200 shadow-lg backdrop-blur">
      <p className="mb-2 font-medium text-slate-300">{labelFormatter(labelStr)}</p>
      {portfolioItem?.value != null && (
        <p className="mb-1 text-slate-100">
          Portefeuille&ensp;
          {maskValues ? "...." : formatBase100Value(Number(portfolioItem.value))}
        </p>
      )}
      {comparisons.map((comparison) => {
        const item = payload.find((payloadItem) => payloadItem.dataKey === comparison.key);
        if (item?.value == null) return null;
        return (
          <p key={comparison.key} style={{ color: comparison.color }}>
            {comparison.label}&ensp;
            {formatBase100Value(Number(item.value))}
          </p>
        );
      })}
    </div>
  );
}

function formatBase100Value(value: number): string {
  const delta = value - 100;
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${Math.abs(delta).toFixed(2)}%`;
}

function buildComparisonData(chart: PortfolioChartDto, comparisons: PortfolioComparisonSerie[], range: RangeKey): ComparisonPoint[] {
  if (chart.timestamps.length === 0 || comparisons.length === 0) return [];

  if (shouldNormalizeComparisonByPoints(range)) {
    const portfolioBase100 = buildPortfolioTwrSeries(chart);
    const comparisonPrices = comparisons.map((comparison) =>
      comparison.timestamps.map((timestamp, index) => ({
        date: timestamp,
        value: comparison.prices[index] ?? null
      }))
    );
    const [portfolio, ...comparisonPerformances] = normalizeSeriesByPoints([portfolioBase100, ...comparisonPrices]);

    return portfolio.map((point, index) => {
      const row: ComparisonPoint = {
        date: Number(point.date),
        portfolio: 100 + point.value
      };

      comparisonPerformances.forEach((series, seriesIndex) => {
        row[comparisonDataKey(seriesIndex)] = series[index] ? 100 + series[index].value : null;
      });

      return row;
    });
  }

  const maxGapMs = 7 * 24 * 60 * 60 * 1000;
  const firstValidIndex = chart.value.findIndex((value) => value != null && Number.isFinite(value) && value !== 0);
  if (firstValidIndex === -1) return [];

  const firstTimestamp = chart.timestamps[firstValidIndex];
  const portfolioNorms = buildPortfolioTwrValues(chart, firstValidIndex);
  const preparedComparisons = comparisons.map((comparison) => {
    const sortedTimestamps = [...comparison.timestamps].sort((a, b) => a - b);
    const refPrice = findClosestPrice(sortedTimestamps, comparison.prices, firstTimestamp, maxGapMs);
    return { comparison, refPrice, sortedTimestamps };
  });

  return chart.timestamps.map((timestamp, index) => {
    const row: ComparisonPoint = {
      date: timestamp,
      portfolio: portfolioNorms[index]
    };

    preparedComparisons.forEach(({ comparison, refPrice, sortedTimestamps }, comparisonIndex) => {
      const price = refPrice ? findClosestPrice(sortedTimestamps, comparison.prices, timestamp, maxGapMs) : null;
      row[comparisonDataKey(comparisonIndex)] = price != null && refPrice ? (price / refPrice) * 100 : null;
    });

    return row;
  });
}

function comparisonDataKey(index: number) {
  return `comparison_${index}`;
}

function findClosestPrice(sortedTimestamps: number[], prices: number[], target: number, maxGapMs: number): number | null {
  if (sortedTimestamps.length === 0) return null;

  let lo = 0;
  let hi = sortedTimestamps.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedTimestamps[mid] < target) lo = mid + 1;
    else hi = mid;
  }

  const candidates = lo > 0 ? [lo - 1, lo] : [lo];
  const best = candidates.reduce((a, b) => (Math.abs(sortedTimestamps[a] - target) <= Math.abs(sortedTimestamps[b] - target) ? a : b));
  if (Math.abs(sortedTimestamps[best] - target) > maxGapMs) return null;

  const price = prices[best];
  return price != null && Number.isFinite(price) ? price : null;
}

function shouldNormalizeComparisonByPoints(range: RangeKey) {
  return range === "1d" || range === "1w" || range === "1m";
}

function buildPortfolioTwrSeries(chart: PortfolioChartDto) {
  const firstValidIndex = chart.value.findIndex((value) => value != null && Number.isFinite(value) && value !== 0);
  if (firstValidIndex === -1) return [];

  const values = buildPortfolioTwrValues(chart, firstValidIndex);
  return chart.timestamps
    .map((timestamp, index) => ({ date: timestamp, value: values[index] }))
    .filter((point): point is { date: number; value: number } => point.value != null);
}

function buildPortfolioTwrValues(chart: PortfolioChartDto, firstValidIndex: number) {
  const portfolioNorms: (number | null)[] = new Array(chart.timestamps.length).fill(null);
  portfolioNorms[firstValidIndex] = 100;

  let twr = 1.0;
  let prevValue = chart.value[firstValidIndex] as number;
  let prevInvested = chart.invested[firstValidIndex] ?? 0;

  for (let index = firstValidIndex + 1; index < chart.timestamps.length; index += 1) {
    const rawValue = chart.value[index];
    if (rawValue == null || !Number.isFinite(rawValue) || rawValue === 0) continue;

    const rawInvested = chart.invested[index] ?? prevInvested;
    const cashFlow = rawInvested - prevInvested;
    const subReturn = (rawValue - cashFlow) / prevValue;

    if (Number.isFinite(subReturn) && subReturn > 0) {
      twr *= subReturn;
    }

    portfolioNorms[index] = twr * 100;
    prevValue = rawValue;
    prevInvested = rawInvested;
  }

  return portfolioNorms;
}

function formatComparisonTick(value: string | number, range: RangeKey, userTimezone?: string): string {
  const dateStr = chartDateValue(value);
  if (range === "1d") return formatChartTime(dateStr, userTimezone);
  if (range === "1w" || range === "1m") return formatChartWeekTick(dateStr, userTimezone);
  return formatChartDate(dateStr, userTimezone);
}

function formatComparisonTooltipLabel(value: string | number, range: RangeKey, userTimezone?: string): string {
  const dateStr = chartDateValue(value);
  if (range === "1d") return formatChartTime(dateStr, userTimezone);
  if (range === "1w" || range === "1m") return formatChartDateTime(dateStr, userTimezone);
  return formatChartDate(dateStr, userTimezone);
}

function chartDateValue(value: string | number): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Date(numeric).toISOString() : String(value);
}

function compressedTicks(length: number, range: RangeKey): number[] {
  if (length <= 0) return [];
  if (range === "1w") return Array.from({ length }, (_, index) => index);
  const targetCount = 6;
  if (length <= targetCount) return Array.from({ length }, (_, index) => index);
  const last = length - 1;
  const ticks = new Set<number>();
  for (let index = 0; index < targetCount; index += 1) {
    ticks.add(Math.round((index * last) / (targetCount - 1)));
  }
  return [...ticks].sort((a, b) => a - b);
}
