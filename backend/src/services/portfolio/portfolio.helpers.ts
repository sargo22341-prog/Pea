import type { RangeKey } from "@pea/shared";

export function nearestTimestamp(target: number, sortedTimestamps: number[]) {
  let nearest = sortedTimestamps[0];
  let nearestDistance = Math.abs(nearest - target);
  for (const timestamp of sortedTimestamps) {
    const distance = Math.abs(timestamp - target);
    if (distance >= nearestDistance) continue;
    nearest = timestamp;
    nearestDistance = distance;
  }
  return nearest;
}

export function isTransactionVisibleInRange(transactionDate: string, transactionTime: number, firstTimestamp: number, lastTimestamp: number, range: RangeKey) {
  if (range === "1w" || range === "1m") return transactionTime >= firstTimestamp && transactionTime <= lastTimestamp;
  const transactionDay = transactionDate.slice(0, 10);
  const firstDay = new Date(firstTimestamp).toISOString().slice(0, 10);
  const lastDay = new Date(lastTimestamp).toISOString().slice(0, 10);
  return transactionDay >= firstDay && transactionDay <= lastDay;
}
