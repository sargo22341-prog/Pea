/**
 * Role du fichier : acces SQL dedie aux candles de marche. Les upserts
 * garantissent l'absence de doublons via UNIQUE(asset_id, interval, datetime_start).
 * Chaque range possede sa propre table (chart_candles_1d/1w/1m/all).
 */

import type { HistoryPoint, RangeKey } from "@pea/shared";
import { db } from "../../db.js";
import { normalizeStoredRange, type ChartInterval, type StoredChartRange } from "../../services/market/charts/chart-config.service.js";
import type { BuiltCandle } from "../../services/candles/candle.builder.js";

const CANDLE_TABLE: Record<StoredChartRange, string> = {
  "1d": "chart_candles_1d",
  "1w": "chart_candles_1w",
  "1m": "chart_candles_1m",
  all: "chart_candles_all"
};

function candleTable(range: StoredChartRange): string {
  const table = CANDLE_TABLE[range];
  if (!table) throw new Error(`Range candle inconnu: ${range}`);
  return table;
}

export class CandleRepository {
  upsertCandles(candles: BuiltCandle[]) {
    for (const candle of candles) {
      const table = candleTable(candle.range);
      db.prepare(
        `INSERT INTO ${table} (asset_id, interval, datetime_start, datetime_end, open, high, low, close, volume, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(asset_id, interval, datetime_start) DO UPDATE SET
           datetime_end = excluded.datetime_end,
           open = excluded.open,
           high = excluded.high,
           low = excluded.low,
           close = excluded.close,
           volume = excluded.volume,
           source = excluded.source,
           updated_at = CURRENT_TIMESTAMP`
      ).run(candle.assetId, candle.interval, candle.datetimeStart, candle.datetimeEnd, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.source);
    }
    return candles.length;
  }

  readCandles(assetId: number, range: RangeKey | string, interval: ChartInterval): HistoryPoint[] {
    const storedRange = normalizeStoredRange(range);
    const table = candleTable(storedRange);
    const rows = db
      .prepare(
        `SELECT datetime_start, open, high, low, close, volume
         FROM ${table}
         WHERE asset_id = ? AND interval = ?
         ORDER BY datetime_start ASC`
      )
      .all(assetId, interval) as Array<{
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

  countCandles(assetId: number, range: RangeKey | string, interval: ChartInterval) {
    const storedRange = normalizeStoredRange(range);
    const table = candleTable(storedRange);
    const row = db
      .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE asset_id = ? AND interval = ?`)
      .get(assetId, interval) as { count?: number } | undefined;
    return Number(row?.count ?? 0);
  }

  /**
   * Retourne la derniere date finalisee connue pour une range asset.
   *
   * @param assetId Identifiant interne de l'asset.
   * @param range Range stockee recherchee.
   * @returns Date de trading finalisee la plus recente, si elle existe.
   */
  latestFinalizedTradingDate(assetId: number, range: StoredChartRange) {
    const row = db
      .prepare("SELECT trading_date FROM market_data_finalizations WHERE asset_id = ? AND range = ? AND finalized = 1 ORDER BY trading_date DESC LIMIT 1")
      .get(assetId, range) as { trading_date?: string } | undefined;
    return row?.trading_date ? String(row.trading_date) : undefined;
  }

  pruneBefore(assetId: number, range: StoredChartRange, interval: ChartInterval, cutoffIso: string) {
    const table = candleTable(range);
    db.prepare(`DELETE FROM ${table} WHERE asset_id = ? AND interval = ? AND datetime_start < ?`)
      .run(assetId, interval, cutoffIso);
  }

  deleteRange(assetId: number, range: StoredChartRange, interval: ChartInterval) {
    const table = candleTable(range);
    db.prepare(`DELETE FROM ${table} WHERE asset_id = ? AND interval = ?`).run(assetId, interval);
  }

  isFinalized(assetId: number, tradingDate: string, range: StoredChartRange) {
    const row = db
      .prepare("SELECT finalized FROM market_data_finalizations WHERE asset_id = ? AND trading_date = ? AND range = ?")
      .get(assetId, tradingDate, range) as { finalized?: number } | undefined;
    return Number(row?.finalized ?? 0) === 1;
  }

  markFinalized(assetId: number, tradingDate: string, range: StoredChartRange) {
    db.prepare(
      `INSERT INTO market_data_finalizations (asset_id, trading_date, range, finalized, finalized_at)
       VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(asset_id, trading_date, range) DO UPDATE SET finalized = 1, finalized_at = CURRENT_TIMESTAMP`
    ).run(assetId, tradingDate, range);
  }
}

export const candleRepository = new CandleRepository();
