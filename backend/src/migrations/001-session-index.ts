import type { Migration } from "./types.js";

export const sessionIndexMigration: Migration = {
  version: 1,
  description: "Index sur user_sessions.expires_at pour optimiser la vérification des sessions actives",
  appliquer: (db) => {
    db.exec("CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)");
  }
};
