/**
 * Role du fichier : construire les candles OHLCV stockees en base a partir des
 * points Yahoo. Les buckets intraday sont alignes sur l'ouverture du marche.
 */

import type { HistoryPoint, RangeKey } from "@pea/shared";
import { normalizeStoredRange, type ChartInterval, type StoredChartRange } from "../market/chart-config.service.js";
import { isTradingDay } from "../market/marketCalendar.service.js";
import { getFirstOpenTime, getMarketCalendar, getSessionsForDate, isInsideAnySession } from "../market/calendars/getMarketCalendar.js";
import { getZonedDateParts, localDayKey, zonedTimeToUtc } from "../timezone/date-time.service.js";

export interface BuiltCandle {
  assetId: number;
  range: StoredChartRange;
  interval: ChartInterval;
  datetimeStart: string;
  datetimeEnd: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  source: "yahoo-finance2" | "snapshot_close" | "yahoo_daily_fallback_close" | "stored_final";
}

function intervalMs(interval: ChartInterval) {
  const unit = interval.slice(-1);
  const amount = Number(interval.slice(0, -1));
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

/** Aligne un point UTC sur le debut de bucket local au marche de cotation. */
function bucketStartFor(pointDate: Date, symbol: string, exchange: string | undefined, interval: ChartInterval) {
  if (interval === "1d") {
    const calendar = getMarketCalendar(symbol, exchange);
    const day = localDayKey(pointDate, calendar.timezone);
    const sessions = getSessionsForDate(calendar, day);
    return zonedTimeToUtc(day, getFirstOpenTime(sessions), calendar.timezone);
  }

  const calendar = getMarketCalendar(symbol, exchange);
  const day = localDayKey(pointDate, calendar.timezone);
  const sessions = getSessionsForDate(calendar, day);
  const open = zonedTimeToUtc(day, getFirstOpenTime(sessions), calendar.timezone);
  const elapsed = Math.max(0, pointDate.getTime() - open.getTime());
  return new Date(open.getTime() + Math.floor(elapsed / intervalMs(interval)) * intervalMs(interval));
}

function inSession(pointDate: Date, symbol: string, exchange: string | undefined) {
  if (!isTradingDay(symbol, exchange, pointDate)) return false;
  const calendar = getMarketCalendar(symbol, exchange);
  const day = localDayKey(pointDate, calendar.timezone);
  const parts = getZonedDateParts(pointDate, calendar.timezone);
  const minutes = parts.hour * 60 + parts.minute;
  return isInsideAnySession(minutes, getSessionsForDate(calendar, day));
}

export class CandleBuilder {
  buildCandles(input: {
    assetId: number;
    symbol: string;
    exchange?: string;
    range: RangeKey | string;
    interval: ChartInterval;
    points: HistoryPoint[];
  }): BuiltCandle[] {
    const range = normalizeStoredRange(input.range);
    const buckets = new Map<string, HistoryPoint[]>();

    for (const point of input.points) {
      const date = new Date(point.date);
      if (!Number.isFinite(date.getTime()) || !Number.isFinite(point.close)) continue;
      if (input.interval === "1d") {
        if (!isTradingDay(input.symbol, input.exchange, date)) continue;
      } else if (!inSession(date, input.symbol, input.exchange)) {
        continue;
      }
      const start = bucketStartFor(date, input.symbol, input.exchange, input.interval);
      const key = start.toISOString();
      const bucket = buckets.get(key) ?? [];
      bucket.push(point);
      buckets.set(key, bucket);
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([datetimeStart, points]) => {
        const sorted = points.sort((a, b) => a.date.localeCompare(b.date));
        const highs = sorted.map((point) => point.high ?? point.close).filter(Number.isFinite);
        const lows = sorted.map((point) => point.low ?? point.close).filter(Number.isFinite);
        const volumes = sorted.map((point) => point.volume).filter((volume): volume is number => Number.isFinite(volume));
        return {
          assetId: input.assetId,
          range,
          interval: input.interval,
          datetimeStart,
          datetimeEnd: new Date(new Date(datetimeStart).getTime() + intervalMs(input.interval)).toISOString(),
          open: sorted.find((point) => Number.isFinite(point.open))?.open ?? sorted[0].close,
          high: highs.length ? Math.max(...highs) : null,
          low: lows.length ? Math.min(...lows) : null,
          close: sorted[sorted.length - 1].close,
          volume: volumes.length ? volumes.reduce((sum, volume) => sum + volume, 0) : null,
          source: "yahoo-finance2" as const
        };
      });
  }
}

export const candleBuilder = new CandleBuilder();
