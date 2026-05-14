import type { Migration } from "./types.js";

/**
 * Sécurité multi-tenant : retire le `DEFAULT 1` historique sur `positions.user_id` et
 * `watchlist.user_id`. Combiné au durcissement de `currentUserId()` (qui lève désormais au
 * lieu de retomber sur user_id=1) et à l'exigence d'un userId explicite dans les repositories,
 * cette migration garantit qu'un INSERT direct en SQL sans userId échoue plutôt que d'attribuer
 * silencieusement la donnée à l'admin.
 *
 * SQLite ne supporte pas `ALTER COLUMN DROP DEFAULT` ; on recopie donc dans une table neuve.
 * Les FK `transactions.position_id` sont préservées en désactivant temporairement les
 * contraintes (les ids/positions sont conservés à l'identique).
 */
export const positionsWatchlistNoDefaultUserIdMigration: Migration = {
  version: 24,
  description: "Retire le DEFAULT 1 sur positions.user_id et watchlist.user_id",
  appliquer: (db) => {
    const fkBefore = (db.prepare("PRAGMA foreign_keys").get() as { foreign_keys?: number } | undefined)?.foreign_keys ?? 1;
    db.exec("PRAGMA foreign_keys = OFF");
    try {
      db.exec(`
        CREATE TABLE positions__migration024 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          symbol TEXT NOT NULL,
          name TEXT NOT NULL,
          quantity REAL NOT NULL,
          average_buy_price REAL NOT NULL,
          currency TEXT NOT NULL DEFAULT 'EUR',
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, symbol),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        INSERT INTO positions__migration024 (id, user_id, symbol, name, quantity, average_buy_price, currency, notes, created_at, updated_at)
        SELECT id, user_id, symbol, name, quantity, average_buy_price, currency, notes, created_at, updated_at FROM positions;

        DROP TABLE positions;
        ALTER TABLE positions__migration024 RENAME TO positions;

        CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
        CREATE INDEX IF NOT EXISTS idx_positions_user_symbol ON positions(user_id, symbol);
      `);

      db.exec(`
        CREATE TABLE watchlist__migration024 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          symbol TEXT NOT NULL,
          name TEXT NOT NULL,
          exchange TEXT,
          currency TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, symbol),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        INSERT INTO watchlist__migration024 (id, user_id, symbol, name, exchange, currency, created_at)
        SELECT id, user_id, symbol, name, exchange, currency, created_at FROM watchlist;

        DROP TABLE watchlist;
        ALTER TABLE watchlist__migration024 RENAME TO watchlist;

        CREATE INDEX IF NOT EXISTS idx_watchlist_user_symbol ON watchlist(user_id, symbol);
      `);
    } finally {
      if (fkBefore) db.exec("PRAGMA foreign_keys = ON");
    }
  }
};
