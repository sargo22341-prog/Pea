import type { DatabaseAdapter } from "../db-adapter.js";
import type { Migration } from "./types.js";

function hasColumn(db: DatabaseAdapter, table: string, column: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((row) => row.name === column);
}

function addColumnIfMissing(db: DatabaseAdapter, column: string, definition: string) {
  if (!hasColumn(db, "users", column)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
  }
}

export const userPreferencesColumnsMigration: Migration = {
  version: 32,
  description: "Verifie les colonnes de preferences utilisateur",
  appliquer: (db) => {
    addColumnIfMissing(db, "dashboard_default_sort_key", "TEXT NOT NULL DEFAULT 'name'");
    addColumnIfMissing(db, "dashboard_default_sort_direction", "TEXT NOT NULL DEFAULT 'asc'");
    addColumnIfMissing(db, "watchlist_default_sort_key", "TEXT NOT NULL DEFAULT 'name'");
    addColumnIfMissing(db, "watchlist_default_sort_direction", "TEXT NOT NULL DEFAULT 'asc'");
    addColumnIfMissing(db, "default_chart_range", "TEXT NOT NULL DEFAULT '1d'");
    addColumnIfMissing(db, "projection_end_age", "INTEGER NOT NULL DEFAULT 90");
    addColumnIfMissing(db, "local_pea_search_enabled", "INTEGER NOT NULL DEFAULT 1");
    addColumnIfMissing(db, "asset_news_enabled", "INTEGER NOT NULL DEFAULT 1");
    addColumnIfMissing(db, "news_language_fr_enabled", "INTEGER NOT NULL DEFAULT 1");
    addColumnIfMissing(db, "news_language_en_enabled", "INTEGER NOT NULL DEFAULT 0");
    addColumnIfMissing(db, "language", "TEXT NOT NULL DEFAULT 'fr'");
    addColumnIfMissing(db, "privacy_mode_enabled", "INTEGER NOT NULL DEFAULT 0");
  }
};
