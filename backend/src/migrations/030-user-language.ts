import type { Migration } from "./types.js";

function hasColumn(db: Parameters<Migration["appliquer"]>[0], table: string, column: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((row) => row.name === column);
}

export const userLanguageMigration: Migration = {
  version: 30,
  description: "Ajoute la langue d'interface par utilisateur",
  appliquer: (db) => {
    if (!hasColumn(db, "users", "language")) {
      db.exec("ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'fr'");
    }
  }
};
