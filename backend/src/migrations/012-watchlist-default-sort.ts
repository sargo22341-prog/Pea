import type { ColonneDb, Migration } from "./types.js";

export const watchlistDefaultSortMigration: Migration = {
  version: 12,
  description: "Colonnes watchlist_default_sort_key et watchlist_default_sort_direction sur users",
  appliquer: (db) => {
    const colonnes = db.prepare("PRAGMA table_info(users)").all() as ColonneDb[];
    if (!colonnes.some((c) => c.name === "watchlist_default_sort_key")) {
      db.exec("ALTER TABLE users ADD COLUMN watchlist_default_sort_key TEXT NOT NULL DEFAULT 'name'");
    }
    if (!colonnes.some((c) => c.name === "watchlist_default_sort_direction")) {
      db.exec("ALTER TABLE users ADD COLUMN watchlist_default_sort_direction TEXT NOT NULL DEFAULT 'asc'");
    }
  }
};
