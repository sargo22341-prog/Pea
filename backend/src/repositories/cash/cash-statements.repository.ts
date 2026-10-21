import type { CashStatementFormat, CashStatementLineKind } from "@pea/shared";
import { db } from "../../db.js";

export interface CashStatementRow {
  id: number;
  user_id: number;
  period: string;
  format: CashStatementFormat;
  opening_date: string;
  closing_date: string;
  opening_cents: number;
  closing_cents: number;
  fingerprint: string;
  imported_at: string;
}

export interface CashStatementLineRow {
  id: number;
  user_id: number;
  period: string;
  line_no: number;
  operation_date: string;
  value_date: string | null;
  kind: CashStatementLineKind;
  label: string;
  amount_cents: number;
  quantity: number | null;
  name: string | null;
  coupon_date: string | null;
  transaction_id: number | null;
  movement_id: number | null;
  dividend_line_id: number | null;
  matched_at: string | null;
  imported_at: string;
}

export interface CashStatementInsert {
  period: string;
  format: CashStatementFormat;
  openingDate: string;
  closingDate: string;
  openingCents: number;
  closingCents: number;
  fingerprint: string;
}

export interface CashStatementLineInsert {
  lineNo: number;
  operationDate: string;
  valueDate?: string | undefined;
  kind: CashStatementLineKind;
  label: string;
  amountCents: number;
  quantity?: number | undefined;
  name?: string | undefined;
  couponDate?: string | undefined;
}

/** Élément de l'application vérifié par une ligne : exactement une des trois références. */
export type CashStatementLink = { transactionId: number } | { movementId: number } | { dividendLineId: number };

function linkColumn(link: CashStatementLink) {
  if ("transactionId" in link) return { column: "transaction_id", id: link.transactionId };
  if ("movementId" in link) return { column: "movement_id", id: link.movementId };
  return { column: "dividend_line_id", id: link.dividendLineId };
}

/** L'élément appartient-il à l'utilisateur ? Contrôlé en SQL avant tout rapprochement. */
const ownership: Record<string, string> = {
  transaction_id: "SELECT 1 FROM transactions t JOIN positions p ON p.id = t.position_id WHERE t.id = ? AND p.user_id = ?",
  movement_id: "SELECT 1 FROM cash_movements WHERE id = ? AND user_id = ?",
  dividend_line_id: "SELECT 1 FROM cash_dividend_statement_lines WHERE id = ? AND user_id = ?"
};

/**
 * Accès SQL des relevés espèces importés. Chaque requête filtre sur `user_id`. L'unicité d'un
 * rapprochement (une ligne ↔ un élément) est garantie par les index uniques de la migration 57.
 */
export const cashStatementsRepository = {
  listStatements(userId: number) {
    return db.prepare("SELECT * FROM cash_statements WHERE user_id = ? ORDER BY period").all(userId) as CashStatementRow[];
  },

  insertStatement(userId: number, statement: CashStatementInsert, importedAt: string) {
    return db.prepare(
      `INSERT OR IGNORE INTO cash_statements (user_id, period, format, opening_date, closing_date, opening_cents, closing_cents, fingerprint, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, statement.period, statement.format, statement.openingDate, statement.closingDate, statement.openingCents, statement.closingCents, statement.fingerprint, importedAt) > 0;
  },

  insertLine(userId: number, period: string, line: CashStatementLineInsert, importedAt: string) {
    db.prepare(
      `INSERT OR IGNORE INTO cash_statement_lines (user_id, period, line_no, operation_date, value_date, kind, label, amount_cents, quantity, name, coupon_date, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, period, line.lineNo, line.operationDate, line.valueDate ?? null, line.kind, line.label, line.amountCents, line.quantity ?? null, line.name ?? null, line.couponDate ?? null, importedAt);
  },

  listLines(userId: number) {
    return db.prepare("SELECT * FROM cash_statement_lines WHERE user_id = ? ORDER BY period, line_no").all(userId) as CashStatementLineRow[];
  },

  /** Rapproche une ligne encore libre d'un élément de l'utilisateur ; faux si la ligne est déjà rapprochée. */
  link(userId: number, period: string, lineNo: number, link: CashStatementLink, matchedAt: string) {
    const { column, id } = linkColumn(link);
    if (!db.prepare(ownership[column] ?? "").get(id, userId)) return false;
    return db.prepare(
      `UPDATE cash_statement_lines SET ${column} = ?, matched_at = ?
       WHERE user_id = ? AND period = ? AND line_no = ? AND transaction_id IS NULL AND movement_id IS NULL AND dividend_line_id IS NULL`
    ).run(id, matchedAt, userId, period, lineNo) > 0;
  },

  findLineFor(userId: number, link: CashStatementLink) {
    const { column, id } = linkColumn(link);
    return db.prepare(`SELECT * FROM cash_statement_lines WHERE user_id = ? AND ${column} = ?`).get(userId, id) as CashStatementLineRow | undefined;
  },

  /** Retire la vérification d'un élément modifié : la ligne redevient à rapprocher. */
  unlink(userId: number, link: CashStatementLink) {
    const { column, id } = linkColumn(link);
    db.prepare(`UPDATE cash_statement_lines SET ${column} = NULL, matched_at = NULL WHERE user_id = ? AND ${column} = ?`).run(userId, id);
  },

  /** La ligne de relevé de coupons devenue un mouvement : la ligne espèces vérifie désormais ce mouvement. */
  relinkDividendLine(userId: number, dividendLineId: number, movementId: number) {
    return db.prepare("UPDATE cash_statement_lines SET dividend_line_id = NULL, movement_id = ? WHERE user_id = ? AND dividend_line_id = ?")
      .run(movementId, userId, dividendLineId) > 0;
  },

  /** Lignes rapprochées des transactions d'une position (suppression de la position). */
  countLinkedTradesOfPosition(userId: number, positionId: number) {
    const row = db.prepare(
      `SELECT COUNT(*) AS count FROM cash_statement_lines l JOIN transactions t ON t.id = l.transaction_id
       WHERE l.user_id = ? AND t.position_id = ?`
    ).get(userId, positionId) as { count: number };
    return row.count;
  }
};
