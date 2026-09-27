import type { HistoryPoint, RangeKey } from "@pea/shared";
import { logger } from "../../shared/logger.service.js";

function interpolatePoint(point: HistoryPoint, previous: HistoryPoint, next: HistoryPoint): HistoryPoint {
  const close = (previous.close + next.close) / 2;
  return {
    ...point,
    close,
    open: Number.isFinite(Number(point.open)) && Number(point.open) > 0 ? point.open : close,
    high: Number.isFinite(Number(point.high)) && Number(point.high) > 0 ? Math.max(Number(point.high), close) : Math.max(previous.close, close, next.close),
    low: Number.isFinite(Number(point.low)) && Number(point.low) > 0 ? Math.min(Number(point.low), close) : Math.min(previous.close, close, next.close)
  };
}

function hasValidClose(point: HistoryPoint | undefined): point is HistoryPoint {
  return point !== undefined && Number.isFinite(point.close) && point.close > 0;
}

function findPreviousValid(points: HistoryPoint[], index: number): HistoryPoint | undefined {
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = points[i];
    if (hasValidClose(candidate)) return candidate;
  }
  return undefined;
}

function findNextValid(points: HistoryPoint[], index: number): HistoryPoint | undefined {
  for (let i = index + 1; i < points.length; i += 1) {
    const candidate = points[i];
    if (hasValidClose(candidate)) return candidate;
  }
  return undefined;
}

function isAberrantPoint(point: HistoryPoint, previous?: HistoryPoint, next?: HistoryPoint) {
  if (!Number.isFinite(point.close) || point.close <= 0) return true;
  if (!previous || !next || previous.close <= 0 || next.close <= 0) return false;

  const expected = (previous.close + next.close) / 2;
  if (!Number.isFinite(expected) || expected <= 0) return false;

  const pointDeviation = Math.abs(point.close - expected) / expected;
  const neighborDeviation = Math.abs(previous.close - next.close) / expected;
  return pointDeviation > 0.2 && neighborDeviation < 0.12;
}

/** De-duplique, normalise et corrige les points incoherents sans changer la regle metier. */
export function sanitizeHistoryPoints(symbol: string, range: RangeKey, points: HistoryPoint[]): HistoryPoint[] {
  const byDate = new Map<string, HistoryPoint>();
  let removedPoints = 0;
  let interpolatedPoints = 0;
  let removedLastPointReason: string | undefined;
  const lastInputPoint = points.at(-1);
  const lastInputTime = lastInputPoint ? new Date(lastInputPoint.date).getTime() : NaN;

  for (const point of points) {
    const time = new Date(point.date).getTime();
    const close = point.close;
    if (!Number.isFinite(time) || !Number.isFinite(close)) {
      removedPoints += 1;
      if (point === lastInputPoint) removedLastPointReason = "invalid-datetime-or-price";
      logger.debug("chart", "history sanitize removed invalid point", { symbol, range, close: point.close, date: point.date, reason: "invalid-datetime-or-price" });
      continue;
    }
    byDate.set(new Date(point.date).toISOString(), { ...point, date: new Date(point.date).toISOString(), close });
  }

  const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const sanitized: HistoryPoint[] = [];
  for (const [index, point] of sorted.entries()) {
    const previous = findPreviousValid(sorted, index);
    const next = findNextValid(sorted, index);

    if (point.close <= 0) {
      removedPoints += 1;
      if (new Date(point.date).getTime() === lastInputTime) removedLastPointReason = "zero-or-negative-price";
      logger.debug("chart", "history sanitize removed invalid point", { symbol, range, close: point.close, date: point.date, reason: "zero-or-negative-price" });
      continue;
    }

    if (isAberrantPoint(point, previous, next)) {
      if (previous && next) {
        interpolatedPoints += 1;
        sanitized.push(interpolatePoint(point, previous, next));
        logger.debug("chart", "history sanitize interpolated aberrant point", { symbol, range, close: point.close, previous: previous.close, next: next.close, date: point.date });
        continue;
      }

      logger.debug("chart", "history sanitize kept aberrant edge point", { symbol, range, close: point.close, date: point.date });
    }

    sanitized.push(point);
  }

  const firstSanitized = sanitized[0];
  const lastSanitized = sanitized.at(-1);
  logger.debug("chart", "history sanitize summary", {
    symbol,
    range,
    firstPoint: firstSanitized ? `${firstSanitized.date}:${firstSanitized.close}` : undefined,
    lastPoint: lastSanitized ? `${lastSanitized.date}:${lastSanitized.close}` : undefined,
    pointsBeforeValidation: points.length,
    pointsAfterValidation: sanitized.length,
    removedPoints,
    interpolatedPoints,
    removedLastPointReason
  });

  return sanitized;
}
