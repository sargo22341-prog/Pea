import type { CashStatementLineRow } from "../../../repositories/cash/cash-statements.repository.js";

/** Préfixe de la référence d'import d'un mouvement créé depuis un relevé espèces (unique par utilisateur). */
export const CASH_STATEMENT_IMPORT_REF_PREFIX = "cash-statement:";

/** Clé d'une ligne de relevé espèces, sans donnée personnelle : `AAAA-MM#ligne`. */
export function lineKey(period: string, lineNo: number) {
  return `${period}#${String(lineNo)}`;
}

/** Élément vérifié par une ligne enregistrée, au format des identifiants du journal. */
export function linkedElementId(row: Pick<CashStatementLineRow, "transaction_id" | "movement_id" | "dividend_line_id">) {
  if (row.transaction_id !== null) return `transaction:${String(row.transaction_id)}`;
  if (row.movement_id !== null) return `movement:${String(row.movement_id)}`;
  if (row.dividend_line_id !== null) return `statement-line:${String(row.dividend_line_id)}`;
  return undefined;
}
