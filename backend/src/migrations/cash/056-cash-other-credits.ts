import type { Migration } from "../types.js";

interface ForeignKeyViolation {
  table: string;
}

/**
 * Remboursements de capital (`capital_repayment`) et indemnisations (`compensation`) : deux
 * crédits qui ne sont ni des versements ni des dividendes. SQLite ne permet pas de modifier la
 * contrainte `CHECK` du type : la table est recopiée à l'identique (identifiants, montants, dates,
 * vérifications et références conservés), avec la contrainte élargie. Les propositions de
 * dividendes qui pointent vers un mouvement gardent leur lien (mêmes identifiants).
 */
export const cashOtherCreditsMigration: Migration = {
  version: 56,
  description: "Ajoute les remboursements de capital et les indemnisations au journal especes",
  sauvegardeAvant: true,
  // PRAGMA foreign_keys est sans effet dans une transaction : seule la recopie en ouvre une.
  transactional: false,
  appliquer: (db) => {
    const fkBefore = (db.prepare("PRAGMA foreign_keys").get() as { foreign_keys?: number } | undefined)?.foreign_keys ?? 1;
    db.exec("PRAGMA foreign_keys = OFF");
    try {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE cash_movements__migration056 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'dividend', 'capital_repayment', 'compensation', 'fee')),
            amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
            effective_at TEXT NOT NULL,
            position_id INTEGER,
            symbol TEXT,
            source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'csv', 'pdf', 'migration')),
            import_ref TEXT,
            note TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            verification TEXT CHECK(verification IN ('manual', 'document')),
            verified_at TEXT,
            verification_ref TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(position_id) REFERENCES positions(id) ON DELETE SET NULL
          );

          INSERT INTO cash_movements__migration056 (id, user_id, type, amount_cents, effective_at, position_id, symbol, source, import_ref, note, created_at, verification, verified_at, verification_ref)
          SELECT id, user_id, type, amount_cents, effective_at, position_id, symbol, source, import_ref, note, created_at, verification, verified_at, verification_ref FROM cash_movements;

          DROP TABLE cash_movements;
          ALTER TABLE cash_movements__migration056 RENAME TO cash_movements;

          CREATE INDEX IF NOT EXISTS idx_cash_movements_user_effective ON cash_movements(user_id, effective_at);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_user_import_ref ON cash_movements(user_id, import_ref) WHERE import_ref IS NOT NULL;
        `);
        const violations = db.prepare("PRAGMA foreign_key_check").all() as ForeignKeyViolation[];
        if (violations.some((row) => row.table === "cash_movements" || row.table === "cash_dividend_proposals")) {
          throw new Error("Migration 56 : la recopie du journal especes casserait une cle etrangere.");
        }
      });
    } finally {
      if (fkBefore) db.exec("PRAGMA foreign_keys = ON");
    }
  }
};
