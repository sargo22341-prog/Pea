import type { HistoryPoint, RangeKey } from "@pea/shared";
import { db } from "../../db.js";
import { normalizeStoredRange, type ChartInterval, type StoredChartRange } from "../../services/market/charts/chart-config.service.js";
import type { BuiltCandle } from "../../services/candles/candle.builder.js";

const STORED_RANGES: readonly StoredChartRange[] = ["1d", "1w", "1m", "all"] as const;

/**
 * Repository des candles. Toutes les opérations passent par la table unifiée `chart_candles`
 * avec une colonne `range_key` qui distingue 1d/1w/1m/all. Remplace les 4 tables historiques
 * `chart_candles_1d/1w/1m/all` consolidées par la migration 027.
 */
export class CandleRepository {
  upsertCandles(candles: BuiltCandle[]) {
    for (const candle of candles) {
      db.prepare(
        `INSERT INTO chart_candles (asset_id, range_key, interval, datetime_start, datetime_end, open, high, low, close, volume, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(asset_id, range_key, interval, datetime_start) DO UPDATE SET
           datetime_end = excluded.datetime_end,
           open = excluded.open,
           high = excluded.high,
           low = excluded.low,
           close = excluded.close,
           volume = excluded.volume,
           source = excluded.source,
           updated_at = CURRENT_TIMESTAMP`
      ).run(
        candle.assetId,
        candle.range,
        candle.interval,
        candle.datetimeStart,
        candle.datetimeEnd,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
        candle.source
      );
    }
    return candles.length;
  }

  readCandles(assetId: number, range: RangeKey | string, interval: ChartInterval): HistoryPoint[] {
    const storedRange = normalizeStoredRange(range);
    const rows = db
      .prepare(
        `SELECT datetime_start, open, high, low, close, volume
         FROM chart_candles
         WHERE asset_id = ? AND range_key = ? AND interval = ?
         ORDER BY datetime_start ASC`
      )
      .all(assetId, storedRange, interval) as Array<{
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
    const row = db
      .prepare(`SELECT COUNT(*) AS count FROM chart_candles WHERE asset_id = ? AND range_key = ? AND interval = ?`)
      .get(assetId, storedRange, interval) as { count?: number } | undefined;
    return Number(row?.count ?? 0);
  }

  hasAnyChartData(assetId: number) {
    const row = db.prepare(`SELECT 1 AS found FROM chart_candles WHERE asset_id = ? LIMIT 1`).get(assetId) as { found?: number } | undefined;
    return Boolean(row);
  }

  /**
   * Supprime les candles `range = "all"` au sein d'une fenêtre temporelle. Conservé tel quel :
   * la fenêtre cible toujours la range "all" (utilisé par stored-range-rebuilder).
   */
  deleteAllRangeWindow(assetId: number, startIso: string, endIso: string) {
    db.prepare(
      `DELETE FROM chart_candles
       WHERE asset_id = ? AND range_key = 'all' AND interval = '1d'
         AND datetime_start >= ? AND datetime_start <= ?`
    ).run(assetId, startIso, endIso);
  }

  latestIntradayDatetime(assetId: number) {
    const row = db
      .prepare("SELECT MAX(datetime_start) AS datetime_start FROM chart_candles WHERE asset_id = ? AND range_key = '1d'")
      .get(assetId) as { datetime_start?: string | null } | undefined;
    return row?.datetime_start ?? undefined;
  }

  latestFinalizedTradingDate(assetId: number, range: StoredChartRange) {
    const row = db
      .prepare("SELECT trading_date FROM market_data_finalizations WHERE asset_id = ? AND range = ? AND finalized = 1 ORDER BY trading_date DESC LIMIT 1")
      .get(assetId, range) as { trading_date?: string } | undefined;
    return row?.trading_date ? String(row.trading_date) : undefined;
  }

  pruneBefore(assetId: number, range: StoredChartRange, interval: ChartInterval, cutoffIso: string) {
    db.prepare(
      `DELETE FROM chart_candles
       WHERE asset_id = ? AND range_key = ? AND interval = ? AND datetime_start < ?`
    ).run(assetId, range, interval, cutoffIso);
  }

  deleteRange(assetId: number, range: StoredChartRange, interval: ChartInterval) {
    db.prepare(`DELETE FROM chart_candles WHERE asset_id = ? AND range_key = ? AND interval = ?`).run(assetId, range, interval);
  }

  /** Liste des ranges stockées (utile pour les batches de cleanup). */
  storedRanges(): readonly StoredChartRange[] {
    return STORED_RANGES;
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
