import type { RangeKey } from "@pea/shared";

export function compressedTicks(length: number, range: RangeKey) {
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

export function chartDataDomain(points: Array<{ date: number; value: number | null }>) {
  const timestamps = points.map((point) => Number(point.date)).filter(Number.isFinite);
  if (timestamps.length === 0) return ["dataMin", "dataMax"] as [string, string];
  return [Math.min(...timestamps), Math.max(...timestamps)] as [number, number];
}
