import type { CashAccountStatus, CashMovementSource, CashMovementType } from "@pea/shared";
import { db } from "../../db.js";

export interface CashAccountRow {
  user_id: number;
  status: CashAccountStatus;
  reference_at: string | null;
  opened_at: string | null;
  opening_cash_cents: number;
  opening_deposits_cents: number;
  opening_withdrawals_cents: number;
  updated_at: string;
}

export interface CashMovementRow {
  id: number;
  user_id: number;
  type: CashMovementType;
  amount_cents: number;
  effective_at: string;
  position_id: number | null;
  symbol: string | null;
  source: CashMovementSource;
  import_ref: string | null;
  note: string | null;
}

/** Opération sur titres lue pour le journal espèces (toutes positions de l'utilisateur). */
export interface CashTradeRow {
  id: number;
  position_id: number;
  symbol: string;
  name: string;
  type: string;
  quantity: number;
  price: number;
  total_fees: number | null;
  traded_at: string;
  source: string | null;
  import_ref: string | null;
}

export interface CashMovementInsert {
  type: CashMovementType;
  amountCents: number;
  effectiveAt: string;
  positionId?: number | null | undefined;
  symbol?: string | null | undefined;
  source: CashMovementSource;
  importRef?: string | null | undefined;
  note?: string | null | undefined;
}

export interface CashAccountUpdate {
  status: CashAccountStatus;
  referenceAt: string | null;
  openedAt: string | null;
  openingCashCents: number;
  openingDepositsCents: number;
  openingWithdrawalsCents: number;
}

/**
 * Accès SQL du compte espèces. Toutes les requêtes filtrent sur `user_id` : l'appelant fournit
 * l'utilisateur courant, jamais un identifiant issu de la requête HTTP.
 */
export class CashRepository {
  findAccount(userId: number): CashAccountRow | undefined {
    return db.prepare("SELECT * FROM cash_accounts WHERE user_id = ?").get(userId) as CashAccountRow | undefined;
  }

  insertAccountIfMissing(userId: number, status: CashAccountStatus) {
    db.prepare("INSERT OR IGNORE INTO cash_accounts (user_id, status) VALUES (?, ?)").run(userId, status);
  }

  updateAccount(userId: number, input: CashAccountUpdate) {
    db.prepare(
      `UPDATE cash_accounts
       SET status = ?, reference_at = ?, opened_at = ?, opening_cash_cents = ?, opening_deposits_cents = ?,
           opening_withdrawals_cents = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`
    ).run(input.status, input.referenceAt, input.openedAt, input.openingCashCents, input.openingDepositsCents, input.openingWithdrawalsCents, userId);
  }

  insertRevision(userId: number, previous: unknown, next: unknown) {
    db.prepare("INSERT INTO cash_account_revisions (user_id, previous_json, next_json) VALUES (?, ?, ?)")
      .run(userId, previous === undefined ? null : JSON.stringify(previous), JSON.stringify(next));
  }

  userHasTransactions(userId: number) {
    return Boolean(db.prepare("SELECT 1 FROM transactions t JOIN positions p ON p.id = t.position_id WHERE p.user_id = ? LIMIT 1").get(userId));
  }

  listMovements(userId: number): CashMovementRow[] {
    return db.prepare("SELECT * FROM cash_movements WHERE user_id = ?").all(userId) as CashMovementRow[];
  }

  findMovement(userId: number, id: number): CashMovementRow | undefined {
    return db.prepare("SELECT * FROM cash_movements WHERE user_id = ? AND id = ?").get(userId, id) as CashMovementRow | undefined;
  }

  insertMovement(userId: number, input: CashMovementInsert) {
    db.prepare(
      `INSERT INTO cash_movements (user_id, type, amount_cents, effective_at, position_id, symbol, source, import_ref, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, input.type, input.amountCents, input.effectiveAt, input.positionId ?? null, input.symbol ?? null, input.source, input.importRef ?? null, input.note ?? null);
  }

  deleteMovement(userId: number, id: number) {
    return db.prepare("DELETE FROM cash_movements WHERE user_id = ? AND id = ?").run(userId, id);
  }

  /** Versements et retraits enregistrés : un état initial ne peut pas les résumer. */
  listExternalFlows(userId: number): CashMovementRow[] {
    return db.prepare("SELECT * FROM cash_movements WHERE user_id = ? AND type IN ('deposit', 'withdrawal')").all(userId) as CashMovementRow[];
  }

  listTrades(userId: number): CashTradeRow[] {
    return db.prepare(
      `SELECT t.id, t.position_id, p.symbol, p.name, t.type, t.quantity, t.price, t.total_fees, t.traded_at, t.source, t.import_ref
       FROM transactions t
       JOIN positions p ON p.id = t.position_id
       WHERE p.user_id = ?`
    ).all(userId) as CashTradeRow[];
  }

  tradeImportRefExists(userId: number, importRef: string) {
    return Boolean(db.prepare(
      "SELECT 1 FROM transactions t JOIN positions p ON p.id = t.position_id WHERE p.user_id = ? AND t.import_ref = ?"
    ).get(userId, importRef));
  }
}

export const cashRepository = new CashRepository();
