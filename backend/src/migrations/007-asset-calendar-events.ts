import type { Migration } from "./types.js";

export const assetCalendarEventsMigration: Migration = {
  version: 7,
  description: "Table asset_calendar_events + purge cache fundamentals sans calendarEvents pour forcer un refetch",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS asset_calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_date TEXT NOT NULL,
        is_estimate INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, event_type, event_date)
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_asset_calendar_events_symbol ON asset_calendar_events(symbol)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_asset_calendar_events_date ON asset_calendar_events(event_date)");
    // La purge ne s'applique qu'aux installations existantes : sur une base neuve, la table
    // historique `cached_fundamentals` n'existe plus (consolidée dans `cache_entries` par
    // la migration 025) — on la skippe gracieusement.
    const tableExists = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'cached_fundamentals'").get());
    if (tableExists) {
      db.exec("DELETE FROM cached_fundamentals WHERE symbol NOT LIKE '%:annual-financials' AND json_type(payload, '$.calendarEvents') IS NULL");
    }
  }
};
