import type { DatabaseAdapter } from "../../db-adapter.js";
import type { ColonneDb, Migration } from "../types.js";

function hasColumn(db: DatabaseAdapter, table: string, column: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as ColonneDb[]).some((row) => row.name === column);
}

/**
 * Compte espèces du PEA (voir `shared/src/cash.ts`).
 *
 * - `cash_accounts` : état initial par utilisateur. Un portefeuille qui contient déjà des
 *   transactions passe en `pending` : ses versements historiques ne sont pas connus et ne sont
 *   jamais reconstruits à partir des achats ; l'utilisateur confirme son état initial à la
 *   prochaine ouverture. Un compte sans transaction est prêt, avec un solde nul.
 * - `cash_movements` : versements, retraits, dividendes encaissés et frais indépendants, en
 *   centimes entiers. Les achats et ventes restent dans `transactions`.
 * - `cash_account_revisions` : trace des corrections de l'état initial.
 * - `transactions.import_ref` : référence d'ordre d'un avis importé, pour refuser un second import.
 *
 * Aucune donnée existante n'est modifiée ni supprimée ; la base est sauvegardée avant application.
 */
export const cashLedgerMigration: Migration = {
  version: 47,
  description: "Ajoute le compte especes du PEA et son journal de mouvements",
  sauvegardeAvant: true,
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_accounts (
        user_id INTEGER PRIMARY KEY,
        status TEXT NOT NULL CHECK(status IN ('pending', 'ready')),
        reference_at TEXT,
        opened_at TEXT,
        opening_cash_cents INTEGER NOT NULL DEFAULT 0,
        opening_deposits_cents INTEGER NOT NULL DEFAULT 0 CHECK(opening_deposits_cents >= 0),
        opening_withdrawals_cents INTEGER NOT NULL DEFAULT 0 CHECK(opening_withdrawals_cents >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS cash_account_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        previous_json TEXT,
        next_json TEXT NOT NULL,
        changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS cash_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'dividend', 'fee')),
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        effective_at TEXT NOT NULL,
        position_id INTEGER,
        symbol TEXT,
        source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'csv', 'pdf', 'migration')),
        import_ref TEXT,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(position_id) REFERENCES positions(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cash_movements_user_effective ON cash_movements(user_id, effective_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_user_import_ref ON cash_movements(user_id, import_ref) WHERE import_ref IS NOT NULL;
    `);

    if (!hasColumn(db, "transactions", "import_ref")) db.exec("ALTER TABLE transactions ADD COLUMN import_ref TEXT");
    db.exec("CREATE INDEX IF NOT EXISTS idx_transactions_import_ref ON transactions(import_ref) WHERE import_ref IS NOT NULL");

    db.exec(`
      INSERT OR IGNORE INTO cash_accounts (user_id, status)
      SELECT u.id,
             CASE WHEN EXISTS (
               SELECT 1 FROM transactions t JOIN positions p ON p.id = t.position_id WHERE p.user_id = u.id
             ) THEN 'pending' ELSE 'ready' END
      FROM users u
    `);
  }
};
