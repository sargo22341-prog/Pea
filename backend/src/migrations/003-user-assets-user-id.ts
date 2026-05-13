import type { ColonneDb, Migration } from "./types.js";

export const userAssetsUserIdMigration: Migration = {
  version: 3,
  description: "Correction du type user_id dans user_assets (TEXT -> INTEGER) et ajout de la clé étrangère vers users",
  appliquer: (db) => {
    const colonnes = db.prepare("PRAGMA table_info(user_assets)").all() as ColonneDb[];
    const colonneUserId = colonnes.find((c) => c.name === "user_id");
    if (colonneUserId?.type?.toUpperCase() === "INTEGER") return;

    db.exec("DROP TABLE IF EXISTS user_assets_nouveau");
    db.exec(`
      CREATE TABLE user_assets_nouveau (
        user_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        quantity REAL NOT NULL,
        average_price REAL NOT NULL,
        transaction_count INTEGER NOT NULL,
        total_fees REAL NOT NULL,
        invested_amount REAL NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(user_id, symbol),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    db.exec(`
      INSERT OR IGNORE INTO user_assets_nouveau
        SELECT CAST(user_id AS INTEGER), symbol, quantity, average_price,
               transaction_count, total_fees, invested_amount, updated_at
        FROM user_assets
    `);
    db.exec("DROP TABLE user_assets");
    db.exec("ALTER TABLE user_assets_nouveau RENAME TO user_assets");
  }
};
