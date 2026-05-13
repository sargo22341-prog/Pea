import type { Migration } from "./types.js";

export const purgeFundamentalsCalendarCacheMigration: Migration = {
  version: 8,
  description: "Purge cache fundamentals sans module calendarEvents pour forcer un refetch avec les nouvelles données",
  appliquer: (db) => {
    db.exec("DELETE FROM cached_fundamentals WHERE symbol NOT LIKE '%:annual-financials' AND json_type(payload, '$.calendarEvents') IS NULL");
  }
};
