import type { Migration } from "./types.js";

const chartRanges = ["1d", "1w", "1m", "all"] as const;

export const chartCandlesRangeTablesMigration: Migration = {
  version: 6,
  description: "Split chart_candles en 4 tables par range (1d, 1w, 1m, all)",
  appliquer: (db) => {
    for (const range of chartRanges) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chart_candles_${range} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          asset_id INTEGER NOT NULL,
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
          UNIQUE(asset_id, interval, datetime_start),
          FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_chart_candles_${range}_asset_interval ON chart_candles_${range}(asset_id, interval)`);
    }

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chart_candles'").all() as Array<{ name: string }>;
    if (tables.length === 0) return;

    for (const range of chartRanges) {
      db.exec(
        `INSERT OR IGNORE INTO chart_candles_${range}
           (asset_id, interval, datetime_start, datetime_end, open, high, low, close, volume, source, created_at, updated_at)
         SELECT asset_id, interval, datetime_start, datetime_end, open, high, low, close, volume, source, created_at, updated_at
         FROM chart_candles WHERE range = '${range}'`
      );
    }
    db.exec("DROP INDEX IF EXISTS idx_chart_candles_asset_range_interval");
    db.exec("DROP INDEX IF EXISTS idx_chart_candles_asset_range");
    db.exec("DROP TABLE chart_candles");
  }
};
