import type { ColonneDb, Migration } from "./types.js";

export const userProfileIconMigration: Migration = {
  version: 2,
  description: "Colonne has_profile_icon sur users pour éviter un accès disque à chaque requête authentifiée",
  appliquer: (db) => {
    const colonnes = db.prepare("PRAGMA table_info(users)").all() as ColonneDb[];
    if (!colonnes.some((c) => c.name === "has_profile_icon")) {
      db.exec("ALTER TABLE users ADD COLUMN has_profile_icon INTEGER NOT NULL DEFAULT 0");
    }
    db.prepare("UPDATE users SET has_profile_icon = 1 WHERE profile_icon_path IS NOT NULL AND has_profile_icon = 0").run();
  }
};
