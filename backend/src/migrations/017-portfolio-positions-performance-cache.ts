import type { Migration } from "./types.js";

export const portfolioPositionsPerformanceCacheMigration: Migration = {
  version: 17,
  description: "Cache des performances de positions portefeuille par utilisateur et range",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS portfolio_positions_performance_cache (
        cache_key TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        range TEXT NOT NULL,
        portfolio_version TEXT NOT NULL,
        market_data_version TEXT NOT NULL,
        payload TEXT NOT NULL,
        cached_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_portfolio_positions_performance_cache_user_range ON portfolio_positions_performance_cache(user_id, range);
      CREATE INDEX IF NOT EXISTS idx_portfolio_positions_performance_cache_expires_at ON portfolio_positions_performance_cache(expires_at);
    `);
  }
};
