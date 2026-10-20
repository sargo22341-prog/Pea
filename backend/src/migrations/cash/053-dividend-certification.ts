import { addColumnIfMissing } from "../add-column.js";
import type { Migration } from "../types.js";

/**
 * Vérification des dividendes encaissés (voir `shared/src/cash-dividend-statements.ts`).
 *
 * - `cash_movements.verification` : `manual` (vérifié par l'utilisateur) ou `document` (certifié
 *   par un relevé de coupons du courtier), avec sa date et la référence du relevé (`AAAA-MM#ligne`).
 * - `cash_dividend_statement_lines` : lignes de relevé certifiées pour des crédits antérieurs ou
 *   égaux à l'état initial. Elles ne créent aucun mouvement (déjà comprises dans le solde déclaré)
 *   mais justifient le montant des dividendes déjà perçus ; l'unicité rend un réimport sans effet.
 * - `cash_accounts.opening_dividends_certified_at` : dividendes déjà perçus certifiés par relevés.
 *
 * Aucune donnée existante n'est modifiée ; un relevé PDF n'est jamais stocké.
 */
export const dividendCertificationMigration: Migration = {
  version: 53,
  description: "Ajoute la verification et la certification par releve des dividendes encaisses",
  appliquer: (db) => {
    addColumnIfMissing(db, "cash_movements", "verification", "TEXT CHECK(verification IN ('manual', 'document'))");
    addColumnIfMissing(db, "cash_movements", "verified_at", "TEXT");
    addColumnIfMissing(db, "cash_movements", "verification_ref", "TEXT");
    addColumnIfMissing(db, "cash_accounts", "opening_dividends_certified_at", "TEXT");
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_dividend_statement_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        period TEXT NOT NULL,
        line_no INTEGER NOT NULL CHECK(line_no > 0),
        isin TEXT NOT NULL,
        payment_date TEXT NOT NULL,
        net_cents INTEGER NOT NULL CHECK(net_cents > 0),
        withholding_cents INTEGER NOT NULL CHECK(withholding_cents >= 0),
        certified_at TEXT NOT NULL,
        UNIQUE(user_id, period, line_no),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }
};
