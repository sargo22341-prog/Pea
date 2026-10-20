import type { Migration } from "../types.js";

/**
 * Propositions de dividendes encaissés (voir `shared/src/cash-dividends.ts`) : une ligne par
 * utilisateur, actif et date de détachement (`ex_date`, `YYYY-MM-DD`), pour qu'une génération
 * répétée ou un rafraîchissement des données de marché ne crée jamais de doublon. Les montants
 * sont en centimes entiers. Une proposition validée référence le mouvement espèces créé.
 */
export const dividendProposalsMigration: Migration = {
  version: 48,
  description: "Ajoute les propositions de dividendes encaisses a valider",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_dividend_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        position_id INTEGER,
        symbol TEXT NOT NULL,
        ex_date TEXT NOT NULL,
        ex_dividend_at TEXT NOT NULL,
        payment_at TEXT NOT NULL,
        payment_estimated INTEGER NOT NULL CHECK(payment_estimated IN (0, 1)),
        quantity REAL NOT NULL CHECK(quantity > 0),
        amount_per_share REAL NOT NULL CHECK(amount_per_share > 0),
        currency TEXT NOT NULL,
        gross_cents INTEGER NOT NULL CHECK(gross_cents >= 0),
        withholding_rate REAL NOT NULL CHECK(withholding_rate >= 0 AND withholding_rate < 1),
        withholding_cents INTEGER NOT NULL CHECK(withholding_cents >= 0),
        net_cents INTEGER NOT NULL CHECK(net_cents >= 0),
        country TEXT,
        withholding_basis TEXT NOT NULL CHECK(withholding_basis IN ('isin', 'listing', 'unknown')),
        needs_review INTEGER NOT NULL CHECK(needs_review IN (0, 1)),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'ignored')),
        movement_id INTEGER,
        decided_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, symbol, ex_date),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(position_id) REFERENCES positions(id) ON DELETE SET NULL,
        FOREIGN KEY(movement_id) REFERENCES cash_movements(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cash_dividend_proposals_user_status ON cash_dividend_proposals(user_id, status, payment_at);
    `);
  }
};
