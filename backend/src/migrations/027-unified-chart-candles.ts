import type { Migration } from "./types.js";

/**
 * Tables candles unifiées : remplace les 4 tables `chart_candles_1d/1w/1m/all` (même schéma)
 * par une table unique `chart_candles` avec une colonne `range_key`.
 *
 * Bénéfices :
 *   - 4× moins d'indexes redondants à maintenir.
 *   - Logique d'écriture unique (plus de `candleTable(range)` switch).
 *   - Migrations futures (ajout d'une range, refactoring du schéma candle) écrivent à un endroit.
 *
 * `cached_intraday_history` reste séparé (logique de pruning par sliding window distincte).
 *
 * La migration copie ligne à ligne avec range_key calculé puis DROP les 4 anciennes.
 */
export const unifiedChartCandlesMigration: Migration = {
  version: 27,
  description: "Unifie chart_candles_1d/1w/1m/all en table unique chart_candles avec range_key",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chart_candles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL,
        range_key TEXT NOT NULL,
        interval TEXT NOT NULL,
        datetime_start TEXT NOT NULL,
        datetime_end TEXT NOT NULL,
        open REAL,
        high REAL,
        low REAL,
        close REAL NOT NULL,
        volume REAL,
        source TEXT NOT NULL DEFAULT 'yahoo-finance2',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(asset_id, range_key, interval, datetime_start),
        FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chart_candles_asset_range_interval
        ON chart_candles(asset_id, range_key, interval);
      CREATE INDEX IF NOT EXISTS idx_chart_candles_asset_range_interval_start
        ON chart_candles(asset_id, range_key, interval, datetime_start);
    `);

    const tableExists = (table: string) =>
      Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));

    for (const range of ["1d", "1w", "1m", "all"] as const) {
      const legacyTable = `chart_candles_${range}`;
      if (!tableExists(legacyTable)) continue;
      db.exec(
        `INSERT OR IGNORE INTO chart_candles (asset_id, range_key, interval, datetime_start, datetime_end, open, high, low, close, volume, source, created_at, updated_at)
         SELECT asset_id, '${range}', interval, datetime_start, datetime_end, open, high, low, close, volume, source, created_at, updated_at FROM ${legacyTable}`
      );
      db.exec(`DROP TABLE ${legacyTable}`);
    }
  }
};
