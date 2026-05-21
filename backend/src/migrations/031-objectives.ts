import type { Migration } from "./types.js";

export const objectivesMigration: Migration = {
  version: 31,
  description: "Ajoute les objectifs financiers et leur cache de projection",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS financial_objectives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('fixed_capital', 'annuity_consuming_capital', 'annuity_preserve_capital', 'annuity_target_final_capital')),
        active INTEGER NOT NULL DEFAULT 1,
        config_json TEXT NOT NULL,
        assumptions_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS objective_projection_cache (
        objective_id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        projection_json TEXT NOT NULL,
        last_updated_at TEXT NOT NULL,
        next_update_at TEXT NOT NULL,
        FOREIGN KEY(objective_id) REFERENCES financial_objectives(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_financial_objectives_user_active ON financial_objectives(user_id, active);
      CREATE INDEX IF NOT EXISTS idx_objective_projection_cache_next_update ON objective_projection_cache(next_update_at);
    `);
    const columns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "projection_end_age")) {
      db.exec("ALTER TABLE users ADD COLUMN projection_end_age INTEGER NOT NULL DEFAULT 90");
    }
  }
};
