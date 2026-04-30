/**
 * Role du fichier : acces SQL dedie aux candles de marche. Les upserts
 * garantissent l'absence de doublons via UNIQUE(asset_id, range, interval, datetime_start).
 */

import type { HistoryPoint, RangeKey } from "@pea/shared";
import { db } from "../../db.js";
import { normalizeStoredRange, type ChartInterval } from "../chart-config.service.js";
import type { BuiltCandle } from "./candle.builder.js";

export class CandleRepository {
  upsertCandles(candles: BuiltCandle[]) {
    for (const candle of candles) {
      db.prepare(
        `INSERT INTO chart_candles (asset_id, range, interval, datetime_start, datetime_end, open, high, low, close, volume, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(asset_id, range, interval, datetime_start) DO UPDATE SET
           datetime_end = excluded.datetime_end,
           open = excluded.open,
           high = excluded.high,
           low = excluded.low,
           close = excluded.close,
           volume = excluded.volume,
           source = excluded.source,
           updated_at = CURRENT_TIMESTAMP`
      ).run(candle.assetId, candle.range, candle.interval, candle.datetimeStart, candle.datetimeEnd, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.source);
    }
    return candles.length;
  }

  readCandles(assetId: number, range: RangeKey | string, interval: ChartInterval): HistoryPoint[] {
    const rows = db
      .prepare(
        `SELECT datetime_start, open, high, low, close, volume
         FROM chart_candles
         WHERE asset_id = ? AND range = ? AND interval = ?
         ORDER BY datetime_start ASC`
      )
      .all(assetId, normalizeStoredRange(range), interval) as Array<{
      datetime_start: string;
      open: number | null;
      high: number | null;
      low: number | null;
      close: number;
      volume: number | null;
    }>;

    return rows.map((row) => ({
      date: row.datetime_start,
      open: row.open ?? undefined,
      high: row.high ?? undefined,
      low: row.low ?? undefined,
      close: Number(row.close),
      volume: row.volume ?? undefined
    }));
  }
}

export const candleRepository = new CandleRepository();
