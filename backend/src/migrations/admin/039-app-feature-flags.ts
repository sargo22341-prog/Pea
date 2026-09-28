import type { Migration } from "../types.js";

/**
 * Interrupteurs des fonctionnalités coûteuses en appels Yahoo. Sans ligne pour une clé, la
 * valeur par défaut du code s'applique (voir `feature-flags.service.ts`).
 */
export const appFeatureFlagsMigration: Migration = {
  version: 39,
  description: "Ajoute les interrupteurs de fonctionnalites administrables",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_feature_flags (
        key TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_by INTEGER,
        FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
  }
};
