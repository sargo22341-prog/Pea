import type { Migration } from "../types.js";

export const userAdvancedModeMigration: Migration = {
  version: 36,
  description: "Ajoute la preference mode avance (blocs de detail deplies d'office)",
  appliquer: (db) => {
    const columns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    if (!columns.some((column) => column.name === "advanced_mode_enabled")) {
      db.exec("ALTER TABLE users ADD COLUMN advanced_mode_enabled INTEGER NOT NULL DEFAULT 0");
    }
  }
};
