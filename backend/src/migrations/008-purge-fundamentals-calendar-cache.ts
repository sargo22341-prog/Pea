import type { Migration } from "./types.js";

export const purgeFundamentalsCalendarCacheMigration: Migration = {
  version: 8,
  description: "Purge cache fundamentals sans module calendarEvents pour forcer un refetch avec les nouvelles données",
  appliquer: (db) => {
    // Sur une base neuve, `cached_fundamentals` n'existe plus (consolidée dans `cache_entries`
    // par la migration 025) — on la skippe gracieusement.
    const tableExists = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'cached_fundamentals'").get());
    if (tableExists) {
      db.exec("DELETE FROM cached_fundamentals WHERE symbol NOT LIKE '%:annual-financials' AND json_type(payload, '$.calendarEvents') IS NULL");
    }
  }
};
