import type { Migration } from "./types.js";

export const yahooUsageLogsMigration: Migration = {
  version: 20,
  description: "Journal d'utilisation des appels réels yahoo-finance2",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS yahoo_usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        method TEXT NOT NULL,
        modules_json TEXT,
        ticker TEXT,
        tickers_json TEXT,
        ticker_count INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        success INTEGER NOT NULL DEFAULT 1,
        error_message TEXT,
        internal_source TEXT,
        range TEXT,
        interval TEXT,
        cache_hit INTEGER NOT NULL DEFAULT 0,
        request_key TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_yahoo_usage_logs_created_at ON yahoo_usage_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_yahoo_usage_logs_method_created_at ON yahoo_usage_logs(method, created_at);
      CREATE INDEX IF NOT EXISTS idx_yahoo_usage_logs_ticker_created_at ON yahoo_usage_logs(ticker, created_at);
    `);
  }
};
