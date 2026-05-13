import type { HistoryPoint } from "@pea/shared";
import type { ChartDisplayInterval } from "../../../utils/range.js";

/** Transforme les lignes chart Yahoo en points chronologiques bornes par period2. */
export function mapChartRows(rows: any[], period2?: Date | string | number): HistoryPoint[] {
  const end = period2 ? new Date(period2).getTime() : Date.now();
  return rows
    .filter((row: any) => row.date && Number.isFinite(Number(row.close)) && new Date(row.date).getTime() <= end)
    .map((row: any) => ({
      date: new Date(row.date).toISOString(),
      open: Number.isFinite(Number(row.open)) ? Number(row.open) : undefined,
      high: Number.isFinite(Number(row.high)) ? Number(row.high) : undefined,
      low: Number.isFinite(Number(row.low)) ? Number(row.low) : undefined,
      volume: Number.isFinite(Number(row.volume)) ? Number(row.volume) : undefined,
      close: Number(row.close)
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Regroupe les points en buckets 2h/4h lorsque l'UI demande un intervalle affiche. */
export function aggregateHistoryPoints(points: HistoryPoint[], displayInterval: ChartDisplayInterval): HistoryPoint[] {
  const bucketMs = displayInterval === "2h" ? 2 * 60 * 60 * 1000 : displayInterval === "4h" ? 4 * 60 * 60 * 1000 : 0;
  if (!bucketMs) return points;

  const buckets = new Map<number, HistoryPoint[]>();
  for (const point of points) {
    const time = new Date(point.date).getTime();
    if (!Number.isFinite(time)) continue;
    const bucketTime = Math.floor(time / bucketMs) * bucketMs;
    const bucket = buckets.get(bucketTime) ?? [];
    bucket.push(point);
    buckets.set(bucketTime, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucketTime, bucket]) => {
      const sorted = bucket.sort((a, b) => a.date.localeCompare(b.date));
      const closes = sorted.map((point) => Number(point.close)).filter(Number.isFinite);
      const highs = sorted.map((point) => Number(point.high ?? point.close)).filter(Number.isFinite);
      const lows = sorted.map((point) => Number(point.low ?? point.close)).filter(Number.isFinite);
      const volumes = sorted.map((point) => Number(point.volume ?? 0)).filter(Number.isFinite);
      return {
        date: new Date(bucketTime).toISOString(),
        open: sorted.find((point) => Number.isFinite(Number(point.open)))?.open ?? sorted[0]?.close,
        high: highs.length ? Math.max(...highs) : undefined,
        low: lows.length ? Math.min(...lows) : undefined,
        close: closes[closes.length - 1] ?? sorted[sorted.length - 1]?.close ?? 0,
        volume: volumes.length ? volumes.reduce((sum, volume) => sum + volume, 0) : undefined
      };
    })
    .filter((point) => Number.isFinite(point.close));
}
