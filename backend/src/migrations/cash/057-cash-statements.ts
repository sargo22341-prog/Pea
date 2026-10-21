import type { Migration } from "../types.js";

/**
 * Relevés espèces importés (voir `shared/src/cash/cash-statements.ts`).
 *
 * - `cash_statements` : un relevé par utilisateur et par mois, avec sa période couverte, ses
 *   soldes et l'empreinte de son contenu (continuité, réimport sans effet).
 * - `cash_statement_lines` : chaque ligne d'opération (date d'écriture, date de valeur, nature,
 *   libellé normalisé, montant signé en centimes, quantité, nom abrégé) et l'élément de
 *   l'application qu'elle vérifie : une transaction, un mouvement espèces ou une ligne de relevé
 *   de coupons d'avant l'état initial. Au plus un élément par ligne (contrainte `CHECK`) et au plus
 *   une ligne par élément (index uniques) : l'unicité est garantie par la base, pas seulement par
 *   le code. Supprimer l'élément retire le rapprochement (`ON DELETE SET NULL`).
 *
 * Aucune donnée existante n'est modifiée ; aucun PDF, IBAN ni nom de personne n'est stocké.
 */
export const cashStatementsMigration: Migration = {
  version: 57,
  description: "Ajoute les releves especes importes et leur rapprochement",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_statements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        period TEXT NOT NULL,
        format TEXT NOT NULL CHECK(format IN ('legacy', 'current')),
        opening_date TEXT NOT NULL,
        closing_date TEXT NOT NULL,
        opening_cents INTEGER NOT NULL,
        closing_cents INTEGER NOT NULL,
        fingerprint TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        UNIQUE(user_id, period),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS cash_statement_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        period TEXT NOT NULL,
        line_no INTEGER NOT NULL CHECK(line_no > 0),
        operation_date TEXT NOT NULL,
        value_date TEXT,
        kind TEXT NOT NULL CHECK(kind IN ('deposit', 'withdrawal', 'buy', 'sell', 'dividend', 'capital_repayment', 'compensation', 'fee', 'balance_transfer')),
        label TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK(amount_cents <> 0),
        quantity REAL,
        name TEXT,
        coupon_date TEXT,
        transaction_id INTEGER,
        movement_id INTEGER,
        dividend_line_id INTEGER,
        matched_at TEXT,
        imported_at TEXT NOT NULL,
        UNIQUE(user_id, period, line_no),
        CHECK((transaction_id IS NOT NULL) + (movement_id IS NOT NULL) + (dividend_line_id IS NOT NULL) <= 1),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id, period) REFERENCES cash_statements(user_id, period) ON DELETE CASCADE,
        FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
        FOREIGN KEY(movement_id) REFERENCES cash_movements(id) ON DELETE SET NULL,
        FOREIGN KEY(dividend_line_id) REFERENCES cash_dividend_statement_lines(id) ON DELETE SET NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_statement_lines_transaction ON cash_statement_lines(transaction_id) WHERE transaction_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_statement_lines_movement ON cash_statement_lines(movement_id) WHERE movement_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_statement_lines_dividend_line ON cash_statement_lines(dividend_line_id) WHERE dividend_line_id IS NOT NULL;
    `);
  }
};
