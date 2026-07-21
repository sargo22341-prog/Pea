import type { PortfolioChartDto, RangeKey } from "@pea/shared";
import { formatChartDate, formatChartDateTime, formatChartTime, formatChartWeekTick } from "../../../lib/format";
import { normalizeSeriesByPoints } from "../../../lib/seriesNormalization";

export interface PortfolioComparisonSerie {
  key: string;
  label: string;
  timestamps: number[];
  prices: number[];
}

export interface ComparisonPoint extends Record<string, number | null> {
  date: number;
  portfolio: number | null;
}

interface ComparisonPricePoint {
  timestamp: number;
  price: number;
}

export function formatBase100Value(value: number): string {
  const delta = value - 100;
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${Math.abs(delta).toFixed(2)}%`;
}

export function buildComparisonData(chart: PortfolioChartDto, comparisons: PortfolioComparisonSerie[], range: RangeKey): ComparisonPoint[] {
  if (chart.timestamps.length === 0 || comparisons.length === 0) return [];

  if (shouldNormalizeComparisonByPoints(range)) {
    const portfolioBase100 = buildPortfolioTwrSeries(chart);
    const comparisonPrices = comparisons.map((comparison) =>
      comparisonPricePoints(comparison).map((point) => ({
        date: point.timestamp,
        value: point.price
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
    const sortedPoints = comparisonPricePoints(comparison);
    const refPrice = findClosestPrice(sortedPoints, firstTimestamp, maxGapMs);
    return { refPrice, sortedPoints };
  });

  return chart.timestamps.map((timestamp, index) => {
    const row: ComparisonPoint = {
      date: timestamp,
      portfolio: portfolioNorms[index]
    };

    preparedComparisons.forEach(({ refPrice, sortedPoints }, comparisonIndex) => {
      const price = refPrice ? findClosestPrice(sortedPoints, timestamp, maxGapMs) : null;
      row[comparisonDataKey(comparisonIndex)] = price != null && refPrice ? (price / refPrice) * 100 : null;
    });

    return row;
  });
}

export function comparisonDataKey(index: number) {
  return `comparison_${index}`;
}

function comparisonPricePoints(comparison: PortfolioComparisonSerie): ComparisonPricePoint[] {
  return comparison.timestamps
    .map((timestamp, index) => ({ timestamp, price: comparison.prices[index] }))
    .filter((point): point is ComparisonPricePoint => Number.isFinite(point.timestamp) && point.price != null && Number.isFinite(point.price))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function findClosestPrice(sortedPoints: ComparisonPricePoint[], target: number, maxGapMs: number): number | null {
  if (sortedPoints.length === 0) return null;

  let lo = 0;
  let hi = sortedPoints.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedPoints[mid].timestamp < target) lo = mid + 1;
    else hi = mid;
  }

  const candidates = lo > 0 ? [lo - 1, lo] : [lo];
  const best = candidates.reduce((a, b) => (Math.abs(sortedPoints[a].timestamp - target) <= Math.abs(sortedPoints[b].timestamp - target) ? a : b));
  if (Math.abs(sortedPoints[best].timestamp - target) > maxGapMs) return null;
  return sortedPoints[best].price;
}

export function shouldNormalizeComparisonByPoints(range: RangeKey) {
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

export function formatComparisonTick(value: string | number, range: RangeKey, userTimezone?: string): string {
  const dateStr = chartDateValue(value);
  if (range === "1d") return formatChartTime(dateStr, userTimezone);
  if (range === "1w" || range === "1m") return formatChartWeekTick(dateStr, userTimezone);
  return formatChartDate(dateStr, userTimezone);
}

export function formatComparisonTooltipLabel(value: string | number, range: RangeKey, userTimezone?: string): string {
  const dateStr = chartDateValue(value);
  if (range === "1d") return formatChartTime(dateStr, userTimezone);
  if (range === "1w" || range === "1m") return formatChartDateTime(dateStr, userTimezone);
  return formatChartDate(dateStr, userTimezone);
}

function chartDateValue(value: string | number): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Date(numeric).toISOString() : String(value);
}

export function compressedTicks(length: number, range: RangeKey): number[] {
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
