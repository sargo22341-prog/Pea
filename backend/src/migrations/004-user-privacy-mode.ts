import type { ColonneDb, Migration } from "./types.js";

export const userPrivacyModeMigration: Migration = {
  version: 4,
  description: "Colonne privacy_mode_enabled sur users pour masquer les chiffres du portefeuille",
  appliquer: (db) => {
    const colonnes = db.prepare("PRAGMA table_info(users)").all() as ColonneDb[];
    if (!colonnes.some((c) => c.name === "privacy_mode_enabled")) {
      db.exec("ALTER TABLE users ADD COLUMN privacy_mode_enabled INTEGER NOT NULL DEFAULT 0");
    }
  }
};
