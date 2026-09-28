import type { Migration } from "../types.js";

/**
 * Historique des recommandations consensuelles vues lors des rafraîchissements fundamentals :
 * une ligne par changement, pour signaler « Passé de Conserver à Acheter » sur le dashboard.
 */
export const assetRecommendationHistoryMigration: Migration = {
  version: 42,
  description: "Ajoute l'historique des recommandations des analystes",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS asset_recommendation_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL,
        recommendation_key TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_asset_recommendation_history_asset ON asset_recommendation_history(asset_id, recorded_at);
    `);
  }
};
