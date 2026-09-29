import type { Migration } from "../types.js";

/** Filtres du screener enregistrés par utilisateur (JSON validé par Zod avant écriture). */
export const userScreenerPresetsMigration: Migration = {
  version: 43,
  description: "Ajoute les filtres enregistres du screener par utilisateur",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_screener_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        filters_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }
};
