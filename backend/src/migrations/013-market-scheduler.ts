import { getMarketCalendar } from "../services/market/calendars/getMarketCalendar.js";
import type { Migration } from "./types.js";

export const marketSchedulerMigration: Migration = {
  version: 13,
  description: "Tables de suivi marche par bourse et backfill depuis les assets suivis",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tracked_markets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market_key TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        timezone TEXT NOT NULL,
        sessions_json TEXT NOT NULL,
        overrides_json TEXT,
        assets_count INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS market_daily_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market_key TEXT NOT NULL,
        trading_date TEXT NOT NULL,
        timezone TEXT NOT NULL,
        open_expected_at TEXT,
        open_status TEXT NOT NULL DEFAULT 'pending',
        open_confirmed_at TEXT,
        open_attempts INTEGER NOT NULL DEFAULT 0,
        open_last_error TEXT,
        open_last_checked_at TEXT,
        next_open_check_at TEXT,
        open_status_message TEXT,
        open_job_id TEXT,
        close_expected_at TEXT,
        close_status TEXT NOT NULL DEFAULT 'pending',
        close_confirmed_at TEXT,
        close_attempts INTEGER NOT NULL DEFAULT 0,
        close_last_error TEXT,
        close_last_checked_at TEXT,
        next_close_check_at TEXT,
        close_status_message TEXT,
        close_job_id TEXT,
        assets_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(market_key, trading_date)
      );

      CREATE TABLE IF NOT EXISTS market_check_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market_key TEXT NOT NULL,
        trading_date TEXT NOT NULL,
        phase TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        expected_at TEXT,
        yahoo_market_state TEXT,
        success INTEGER NOT NULL DEFAULT 0,
        partial_success INTEGER NOT NULL DEFAULT 0,
        message TEXT,
        symbols_count INTEGER NOT NULL DEFAULT 0,
        valid_symbols_count INTEGER NOT NULL DEFAULT 0,
        failed_symbols_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scheduler_health (
        scheduler_name TEXT PRIMARY KEY,
        last_tick_at TEXT,
        last_successful_tick_at TEXT,
        last_error TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_market_daily_runs_market_date ON market_daily_runs(market_key, trading_date);
      CREATE INDEX IF NOT EXISTS idx_market_check_logs_created_at ON market_check_logs(created_at);
    `);

    const assets = db
      .prepare(
        `SELECT DISTINCT a.symbol, a.exchange
         FROM assets a
         WHERE a.symbol IN (SELECT symbol FROM positions)
            OR a.symbol IN (SELECT symbol FROM watchlist)`
      )
      .all() as Array<{ symbol: string; exchange?: string | null }>;
    const counts = new Map<string, { calendar: ReturnType<typeof getMarketCalendar>; count: number }>();
    for (const asset of assets) {
      const calendar = getMarketCalendar(asset.symbol, asset.exchange ?? undefined);
      const existing = counts.get(calendar.market);
      if (existing) existing.count += 1;
      else counts.set(calendar.market, { calendar, count: 1 });
    }

    const timestamp = new Date().toISOString();
    for (const { calendar, count } of counts.values()) {
      db.prepare(
        `INSERT INTO tracked_markets (market_key, display_name, timezone, sessions_json, overrides_json, assets_count, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(market_key) DO UPDATE SET
           display_name = excluded.display_name,
           timezone = excluded.timezone,
           sessions_json = excluded.sessions_json,
           overrides_json = excluded.overrides_json,
           assets_count = excluded.assets_count,
           enabled = CASE WHEN excluded.assets_count > 0 THEN 1 ELSE tracked_markets.enabled END,
           updated_at = excluded.updated_at`
      ).run(
        calendar.market,
        calendar.city,
        calendar.timezone,
        JSON.stringify(calendar.sessions),
        calendar.dayOverrides?.length ? JSON.stringify(calendar.dayOverrides) : null,
        count,
        timestamp,
        timestamp
      );
    }
  }
};
