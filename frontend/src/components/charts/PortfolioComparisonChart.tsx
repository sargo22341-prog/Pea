/**
 * Rôle du fichier : graphique de comparaison portefeuille vs benchmark en base 100.
 * Les deux séries sont normalisées via le Time-Weighted Return (TWR) afin que
 * les achats/ventes d'actifs ne soient pas comptabilisés comme de la performance.
 *
 * Exemple : si on achète de nouvelles actions en cours de période, la valeur brute
 * du portefeuille augmente mais la courbe reste stable (achat ≠ perf).
 * Une valeur de 115 signifie +15% de rendement pur depuis le début de la période.
 */

import type { PortfolioChartDto, RangeKey } from "@pea/shared";
import { memo, useId, useMemo } from "react";
import { Area, ComposedChart, Legend, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import type { BenchmarkData } from "../dashboard/benchmark/useBenchmarkChart";
import { BENCHMARK_COLOR } from "../dashboard/benchmark/benchmarks.config";
import { formatChartDate, formatChartDateTime, formatChartTime, formatChartWeekTick } from "../../lib/format";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";

interface ComparisonPoint {
  date: number;
  /** Valeur portefeuille normalisée en base 100. */
  portfolio: number | null;
  /** Valeur benchmark normalisée en base 100, alignée sur le même timestamp portefeuille. */
  benchmark: number | null;
}

export const PortfolioComparisonChart = memo(function PortfolioComparisonChart({
  chart,
  benchmark,
  range,
  userTimezone,
  maskValues = false,
}: {
  chart: PortfolioChartDto;
  benchmark: BenchmarkData;
  range: RangeKey;
  userTimezone?: string;
  maskValues?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const compressTimeAxis = range === "1w" || range === "1m";

  // Normalisation et alignement des deux séries en base 100
  const comparisonData = useMemo(() => buildComparisonData(chart, benchmark, range), [chart, benchmark, range]);

  // Tendance portefeuille pour la couleur de la courbe (cohérent avec PriceHistoryChart)
  const portfolioColor = useMemo(() => {
    const valid = comparisonData.filter((p): p is ComparisonPoint & { portfolio: number } => p.portfolio != null);
    const first = valid[0]?.portfolio;
    const last = valid[valid.length - 1]?.portfolio;
    if (first == null || last == null) return "#38bdf8";
    return last > first ? "#22c55e" : last < first ? "#ef4444" : "#38bdf8";
  }, [comparisonData]);

  // Données adaptées à l'axe compressé (1w/1m utilisent un index numérique)
  const renderData = compressTimeAxis
    ? comparisonData.map((point, index) => ({ ...point, x: index }))
    : comparisonData;

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
          <defs>
            <linearGradient id={`${id}-portfolio-gradient`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={portfolioColor} stopOpacity={0.12} />
              <stop offset="100%" stopColor={portfolioColor} stopOpacity={0} />
            </linearGradient>
          </defs>

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

          {/* YAxis masqué : les valeurs sont lisibles dans le tooltip */}
          <YAxis hide domain={["auto", "auto"]} />

          {/* Ligne de référence à 100 (point de départ commun des deux séries) */}
          <ReferenceLine
            ifOverflow="extendDomain"
            stroke="#94a3b8"
            strokeDasharray="4 4"
            strokeOpacity={0.35}
            strokeWidth={1}
            y={100}
          />

          <Tooltip
            content={(props) => (
              <ComparisonTooltip
                active={props.active}
                benchmarkLabel={benchmark.label}
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
              <div className="flex justify-center gap-5 pt-1 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-5 rounded" style={{ backgroundColor: portfolioColor }} />
                  Portefeuille
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-5 rounded" style={{ backgroundColor: BENCHMARK_COLOR }} />
                  {benchmark.label}
                </span>
              </div>
            )}
          />

          {/* Courbe portefeuille avec léger gradient */}
          <Area
            activeDot={{ r: 4 }}
            connectNulls={false}
            dataKey="portfolio"
            dot={false}
            fill={`url(#${id}-portfolio-gradient)`}
            isAnimationActive={false}
            stroke={portfolioColor}
            strokeWidth={2.5}
            type="monotone"
          />

          {/* Courbe benchmark en jaune doré, sans remplissage */}
          <Line
            activeDot={{ fill: BENCHMARK_COLOR, r: 4 }}
            connectNulls={false}
            dataKey="benchmark"
            dot={false}
            isAnimationActive={false}
            stroke={BENCHMARK_COLOR}
            strokeWidth={2}
            type="monotone"
          />
        </ComposedChart>
      </SafeResponsiveContainer>
    </div>
  );
});

// ─── Tooltip ────────────────────────────────────────────────────────────────

type TooltipPayloadItem = {
  dataKey?: string | number | ((obj: unknown) => unknown);
  value?: unknown;
};

function ComparisonTooltip({
  active,
  payload,
  label,
  labelFormatter,
  benchmarkLabel,
  maskValues
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipPayloadItem>;
  label?: unknown;
  labelFormatter: (value: string | number) => string;
  benchmarkLabel: string;
  maskValues: boolean;
}) {
  if (!active || !payload?.length) return null;

  const portfolioItem = payload.find((p) => p.dataKey === "portfolio");
  const benchmarkItem = payload.find((p) => p.dataKey === "benchmark");

  const labelStr = typeof label === "number" || typeof label === "string" ? label : "";

  return (
    <div className="rounded-lg border-0 bg-ink/80 p-3 text-xs text-slate-200 shadow-lg backdrop-blur">
      <p className="mb-2 font-medium text-slate-300">{labelFormatter(labelStr)}</p>
      {portfolioItem?.value != null && (
        <p className="mb-1 text-slate-100">
          Portefeuille&ensp;
          {maskValues ? "••••" : formatBase100Value(Number(portfolioItem.value))}
        </p>
      )}
      {benchmarkItem?.value != null && (
        <p style={{ color: BENCHMARK_COLOR }}>
          {benchmarkLabel}&ensp;
          {formatBase100Value(Number(benchmarkItem.value))}
        </p>
      )}
    </div>
  );
}

/**
 * Formate une valeur base 100 en affichant le delta depuis 100.
 * Ex : 115.3 → "+15.3%", 94.2 → "−5.8%"
 */
function formatBase100Value(value: number): string {
  const delta = value - 100;
  const sign = delta >= 0 ? "+" : "−";
  return `${sign}${Math.abs(delta).toFixed(2)}%`;
}

// ─── Normalisation et alignement des données ────────────────────────────────

/**
 * Aligne et normalise les deux séries en base 100 via le Time-Weighted Return (TWR).
 *
 * Le TWR neutralise les flux de trésorerie (achats/ventes) en soustrayant à chaque
 * étape la variation du capital investi (delta `invested`). Ainsi, un achat d'actifs
 * fait monter `value` ET `invested` du même montant → le sous-rendement reste neutre.
 *
 * Algorithme :
 * 1. Premier point valide → base 100, prevValue = V₀, prevInvested = I₀
 * 2. Pour chaque point suivant :
 *    - cf = invested[i] - prevInvested  (flux entrant : positif = achat)
 *    - sub_return = (value[i] - cf) / prevValue
 *    - twr *= sub_return
 *    - portfolio_norm = twr × 100
 * 3. Benchmark : normalisé sur le prix le plus proche du premier timestamp portefeuille.
 *
 * Pour la vue intraday (1d), la tolérance de gap est réduite à 36h pour éviter
 * le cross-day mismatch (férié, fuseau US/EU).
 */
function buildComparisonData(chart: PortfolioChartDto, benchmark: BenchmarkData, range: RangeKey): ComparisonPoint[] {
  if (chart.timestamps.length === 0 || benchmark.timestamps.length === 0) return [];

  // Tolérance d'alignement : plus stricte en intraday pour éviter le cross-day mismatch.
  const maxGapMs = range === "1d" ? 36 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;

  const sortedBenchmarkTimestamps = [...benchmark.timestamps].sort((a, b) => a - b);

  const firstValidIndex = chart.value.findIndex((v) => v != null && Number.isFinite(v) && v !== 0);
  if (firstValidIndex === -1) return [];

  const firstTimestamp = chart.timestamps[firstValidIndex];

  // --- TWR pour la série portefeuille ---
  const portfolioNorms: (number | null)[] = new Array(chart.timestamps.length).fill(null);
  portfolioNorms[firstValidIndex] = 100;

  let twr = 1.0;
  let prevValue = chart.value[firstValidIndex] as number;
  let prevInvested = chart.invested[firstValidIndex] ?? 0;

  for (let i = firstValidIndex + 1; i < chart.timestamps.length; i++) {
    const rawValue = chart.value[i];
    if (rawValue == null || !Number.isFinite(rawValue) || rawValue === 0) continue;

    // Flux entrant net : positif = achat de nouveaux actifs, négatif = vente
    const rawInvested = chart.invested[i] ?? prevInvested;
    const cf = rawInvested - prevInvested;
    const subReturn = (rawValue - cf) / prevValue;

    // On ignore les sous-rendements aberrants (division par zéro, données manquantes)
    if (Number.isFinite(subReturn) && subReturn > 0) {
      twr *= subReturn;
    }
    portfolioNorms[i] = twr * 100;

    prevValue = rawValue;
    prevInvested = rawInvested;
  }

  // --- Normalisation benchmark en base 100 ---
  const benchmarkRefPrice = findClosestBenchmarkPrice(sortedBenchmarkTimestamps, benchmark.prices, firstTimestamp, maxGapMs);
  if (benchmarkRefPrice == null || benchmarkRefPrice === 0) {
    return chart.timestamps.map((timestamp, index) => ({
      date: timestamp,
      portfolio: portfolioNorms[index],
      benchmark: null,
    }));
  }

  return chart.timestamps.map((timestamp, index) => {
    const benchmarkPrice = findClosestBenchmarkPrice(sortedBenchmarkTimestamps, benchmark.prices, timestamp, maxGapMs);
    const benchmarkNorm = benchmarkPrice != null ? (benchmarkPrice / benchmarkRefPrice) * 100 : null;
    return { date: timestamp, portfolio: portfolioNorms[index], benchmark: benchmarkNorm };
  });
}

/**
 * Recherche binaire du prix benchmark le plus proche d'un timestamp cible.
 * Retourne null si la distance dépasse maxGapMs (dépend de la range).
 */
function findClosestBenchmarkPrice(
  sortedTimestamps: number[],
  prices: number[],
  target: number,
  maxGapMs: number
): number | null {
  if (sortedTimestamps.length === 0) return null;

  let lo = 0;
  let hi = sortedTimestamps.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedTimestamps[mid] < target) lo = mid + 1;
    else hi = mid;
  }

  // Comparer l'indice trouvé et son voisin gauche
  const candidates = lo > 0 ? [lo - 1, lo] : [lo];
  const best = candidates.reduce((a, b) =>
    Math.abs(sortedTimestamps[a] - target) <= Math.abs(sortedTimestamps[b] - target) ? a : b
  );

  if (Math.abs(sortedTimestamps[best] - target) > maxGapMs) return null;

  const price = prices[best];
  return price != null && Number.isFinite(price) ? price : null;
}

// ─── Formatage des axes et tooltip ──────────────────────────────────────────

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
  if (range === "1w") return Array.from({ length }, (_, i) => i);
  const targetCount = 6;
  if (length <= targetCount) return Array.from({ length }, (_, i) => i);
  const last = length - 1;
  const ticks = new Set<number>();
  for (let i = 0; i < targetCount; i++) {
    ticks.add(Math.round((i * last) / (targetCount - 1)));
  }
  return [...ticks].sort((a, b) => a - b);
}
