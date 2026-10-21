import type { DividendVerification } from "@pea/shared";
import { db } from "../../db.js";

export interface StatementLineRow {
  id: number;
  user_id: number;
  period: string;
  line_no: number;
  isin: string;
  /** Nom de la valeur lu sur le relevé ; absent pour une ligne importée avant la migration 54. */
  name: string | null;
  payment_date: string;
  net_cents: number;
  withholding_cents: number;
  certified_at: string;
}

export interface StatementPositionRow {
  id: number;
  symbol: string;
  name: string;
  isin: string | null;
}

export interface StatementLineInsert {
  period: string;
  lineNo: number;
  isin: string;
  name: string;
  paymentDate: string;
  netCents: number;
  withholdingCents: number;
  certifiedAt: string;
}

/**
 * Accès SQL de la vérification des crédits liés à un titre. Chaque requête filtre sur `user_id`
 * et, pour un mouvement, sur les types `dividend`, `capital_repayment` et `compensation` : un
 * versement, un retrait ou des frais ne peuvent jamais être certifiés par un relevé de coupons.
 */
export const dividendVerificationRepository = {
  /** Positions et leur ISIN : saisi sur la position, sinon le plus récent des avis d'opéré importés. */
  listPositions(userId: number) {
    return db.prepare(
      `SELECT p.id, p.symbol, COALESCE(p.name, p.symbol) AS name,
              COALESCE(NULLIF(TRIM(p.isin), ''), (
                SELECT t.isin FROM transactions t
                WHERE t.position_id = p.id AND t.isin IS NOT NULL AND TRIM(t.isin) <> ''
                ORDER BY t.id DESC LIMIT 1
              )) AS isin
       FROM positions p WHERE p.user_id = ? ORDER BY p.symbol`
    ).all(userId) as StatementPositionRow[];
  },

  setVerification(userId: number, movementId: number, verification: DividendVerification, verifiedAt: string, reference: string | null) {
    return db.prepare(
      "UPDATE cash_movements SET verification = ?, verified_at = ?, verification_ref = ? WHERE user_id = ? AND id = ? AND type IN ('dividend', 'capital_repayment', 'compensation')"
    ).run(verification, verifiedAt, reference, userId, movementId) > 0;
  },

  clearVerification(userId: number, movementId: number) {
    db.prepare("UPDATE cash_movements SET verification = NULL, verified_at = NULL, verification_ref = NULL WHERE user_id = ? AND id = ?").run(userId, movementId);
  },

  /** Ligne déjà certifiée : un réimport du même relevé est sans effet. */
  insertStatementLine(userId: number, line: StatementLineInsert) {
    return db.prepare(
      `INSERT OR IGNORE INTO cash_dividend_statement_lines (user_id, period, line_no, isin, name, payment_date, net_cents, withholding_cents, certified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, line.period, line.lineNo, line.isin, line.name, line.paymentDate, line.netCents, line.withholdingCents, line.certifiedAt) > 0;
  },

  /** Réimport d'un relevé : complète le nom d'une ligne déjà certifiée, sans rien modifier d'autre. */
  completeStatementLineName(userId: number, period: string, lineNo: number, name: string) {
    db.prepare(
      "UPDATE cash_dividend_statement_lines SET name = ? WHERE user_id = ? AND period = ? AND line_no = ? AND (name IS NULL OR TRIM(name) = '')"
    ).run(name, userId, period, lineNo);
  },

  listStatementLines(userId: number) {
    return db.prepare("SELECT * FROM cash_dividend_statement_lines WHERE user_id = ? ORDER BY payment_date, period, line_no").all(userId) as StatementLineRow[];
  },

  /** Ligne devenue un mouvement certifié (passage en historique complet). */
  deleteStatementLine(userId: number, id: number) {
    db.prepare("DELETE FROM cash_dividend_statement_lines WHERE user_id = ? AND id = ?").run(userId, id);
  },

  setOpeningDividendsCertified(userId: number, certifiedAt: string | null) {
    db.prepare("UPDATE cash_accounts SET opening_dividends_certified_at = ? WHERE user_id = ?").run(certifiedAt, userId);
  }
};
