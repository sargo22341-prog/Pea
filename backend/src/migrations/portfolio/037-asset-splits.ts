import type { Migration } from "../types.js";

/**
 * Divisions d'actions détectées chez Yahoo et décisions des utilisateurs.
 *
 * Les transactions saisies ne sont jamais réécrites : l'ajustement est appliqué à la lecture,
 * uniquement pour les utilisateurs qui ont choisi « appliquer ».
 */
export const assetSplitsMigration: Migration = {
  version: 37,
  description: "Ajoute les divisions d'actions et les decisions d'ajustement par utilisateur",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS asset_splits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL,
        split_date TEXT NOT NULL,
        numerator REAL NOT NULL CHECK(numerator > 0),
        denominator REAL NOT NULL CHECK(denominator > 0),
        source TEXT NOT NULL,
        detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(asset_id, split_date),
        FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_split_decisions (
        user_id INTEGER NOT NULL,
        asset_split_id INTEGER NOT NULL,
        decision TEXT NOT NULL CHECK(decision IN ('apply', 'ignore')),
        decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, asset_split_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(asset_split_id) REFERENCES asset_splits(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_split_decisions_split ON user_split_decisions(asset_split_id);
    `);
  }
};
