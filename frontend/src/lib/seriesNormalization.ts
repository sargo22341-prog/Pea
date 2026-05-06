export type NormalizableSeriesPoint = {
  value?: number | null;
  date?: string | number;
  timestamp?: number;
  [key: string]: unknown;
};

export type NormalizedSeriesPoint<T extends NormalizableSeriesPoint> = Omit<T, "value"> & {
  value: number;
  interpolated?: boolean;
};

export function normalizeSeriesByPoints<T extends NormalizableSeriesPoint>(
  seriesList: T[][],
  targetLength?: number
): Array<Array<NormalizedSeriesPoint<T>>> {
  const performances = seriesList.map(toPerformance);
  const validPerformances = performances.filter((series) => series.length > 1);
  if (validPerformances.length === 0) return performances.map(() => []);

  const length = targetLength ?? Math.min(...validPerformances.map((series) => series.length));
  if (!Number.isFinite(length) || length < 2) return performances;

  return performances.map((series) => (series.length > 1 ? resampleSeries(series, length) : []));
}

function toPerformance<T extends NormalizableSeriesPoint>(series: T[]): Array<NormalizedSeriesPoint<T>> {
  const validPoints = series.filter((point): point is T & { value: number } => {
    const value = point.value;
    return value != null && Number.isFinite(value);
  });

  const firstValue = validPoints[0]?.value;
  if (firstValue == null || firstValue === 0) return [];

  return validPoints.map((point) => ({
    ...point,
    value: ((point.value - firstValue) / firstValue) * 100
  }));
}

function resampleSeries<T extends NormalizableSeriesPoint>(
  series: Array<NormalizedSeriesPoint<T>>,
  targetLength: number
): Array<NormalizedSeriesPoint<T>> {
  if (series.length === targetLength) return series;
  if (series.length < 2 || targetLength < 2) return series;

  const lastIndex = series.length - 1;
  const lastTargetIndex = targetLength - 1;

  return Array.from({ length: targetLength }, (_, index) => {
    const position = (index * lastIndex) / lastTargetIndex;
    const leftIndex = Math.floor(position);
    const rightIndex = Math.ceil(position);
    const ratio = position - leftIndex;

    const left = series[leftIndex];
    const right = series[rightIndex];

    if (leftIndex === rightIndex) return left;

    return interpolatePoint(left, right, ratio);
  });
}

function interpolatePoint<T extends NormalizableSeriesPoint>(
  left: NormalizedSeriesPoint<T>,
  right: NormalizedSeriesPoint<T>,
  ratio: number
): NormalizedSeriesPoint<T> {
  return {
    ...left,
    date: interpolateDateLike(left.date, right.date, ratio),
    timestamp: interpolateNumber(left.timestamp, right.timestamp, ratio),
    value: left.value + (right.value - left.value) * ratio,
    interpolated: true
  };
}

function interpolateNumber(left: unknown, right: unknown, ratio: number) {
  if (typeof left !== "number" || typeof right !== "number") return left as number | undefined;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return left;
  return left + (right - left) * ratio;
}

function interpolateDateLike(left: unknown, right: unknown, ratio: number) {
  if (typeof left === "number" && typeof right === "number") return interpolateNumber(left, right, ratio);
  if (typeof left !== "string" || typeof right !== "string") return left as string | number | undefined;

  const leftDate = new Date(left).getTime();
  const rightDate = new Date(right).getTime();
  if (!Number.isFinite(leftDate) || !Number.isFinite(rightDate)) return left;

  return new Date(leftDate + (rightDate - leftDate) * ratio).toISOString();
}
