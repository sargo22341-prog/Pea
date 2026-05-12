import type { Position } from "@pea/shared";
import { db } from "../../db.js";
import { normalizeUserId } from "../../services/auth/user-context.js";

export interface PositionRow {
  id: number;
  user_id: number;
  symbol: string;
  name: string;
  quantity: number;
  average_buy_price: number;
  currency: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionRow {
  id: number;
  position_id: number;
  type: "buy" | "sell" | string;
  quantity: number;
  price: number;
  total_fees?: number | null;
  currency: string;
  traded_at: string;
  source?: string | null;
  source_file_name?: string | null;
  asset_name?: string | null;
  isin?: string | null;
  ticker?: string | null;
  raw_text_snippet?: string | null;
}

export function mapPosition(row: PositionRow): Position {
  return {
    id: Number(row.id),
    symbol: String(row.symbol),
    name: String(row.name),
    quantity: Number(row.quantity),
    averageBuyPrice: Number(row.average_buy_price),
    currency: String(row.currency),
    notes: row.notes ?? undefined,
    createdAt: String(row.created_at)
  };
}

function transactionTime(row: TransactionRow) {
  const time = new Date(row.traded_at).getTime();
  return Number.isFinite(time) ? time : 0;
}

function compareTransactionAsc(a: TransactionRow, b: TransactionRow) {
  const dateOrder = transactionTime(a) - transactionTime(b);
  if (dateOrder !== 0) return dateOrder;
  return Number(a.id) - Number(b.id);
}

export class PortfolioRepository {
  listPositions(userId?: number | string): PositionRow[] {
    return db.prepare("SELECT * FROM positions WHERE user_id = ? ORDER BY symbol ASC").all(normalizeUserId(userId)) as PositionRow[];
  }

  findPositionBySymbol(symbol: string, userId?: number | string): PositionRow | undefined {
    return db.prepare("SELECT * FROM positions WHERE user_id = ? AND symbol = ?").get(normalizeUserId(userId), symbol.toUpperCase()) as PositionRow | undefined;
  }

  findPositionById(positionId: number, userId?: number | string): PositionRow | undefined {
    return db.prepare("SELECT * FROM positions WHERE user_id = ? AND id = ?").get(normalizeUserId(userId), positionId) as PositionRow | undefined;
  }

  insertPosition(input: { symbol: string; name: string; quantity: number; averageBuyPrice: number; currency: string }, userId?: number | string) {
    db.prepare(
      `INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(normalizeUserId(userId), input.symbol, input.name, input.quantity, input.averageBuyPrice, input.currency);
  }

  updatePositionSnapshot(positionId: number, input: { quantity: number; averageBuyPrice: number; name?: string; currency: string; notes?: string | null }) {
    db.prepare(
      `UPDATE positions
       SET quantity = ?, average_buy_price = ?, name = COALESCE(?, name), currency = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(input.quantity, input.averageBuyPrice, input.name ?? null, input.currency, input.notes ?? null, positionId);
  }

  mergePositionSnapshot(positionId: number, input: { quantity: number; averageBuyPrice: number; name: string; currency: string }) {
    db.prepare(
      `UPDATE positions
       SET quantity = ?, average_buy_price = ?, name = ?, currency = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(input.quantity, input.averageBuyPrice, input.name, input.currency, positionId);
  }

  deletePosition(positionId: number, userId?: number | string) {
    return db.prepare("DELETE FROM positions WHERE user_id = ? AND id = ?").run(normalizeUserId(userId), positionId);
  }

  listTransactions(positionId: number): TransactionRow[] {
    return (db.prepare("SELECT * FROM transactions WHERE position_id = ?").all(positionId) as TransactionRow[])
      .sort((a, b) => compareTransactionAsc(b, a));
  }

  listTransactionSequence(positionId: number): TransactionRow[] {
    return (db.prepare("SELECT * FROM transactions WHERE position_id = ?").all(positionId) as TransactionRow[])
      .sort(compareTransactionAsc);
  }

  insertManualTransaction(positionId: number, input: { type: "buy" | "sell"; quantity: number; price: number; totalFees?: number; currency: string; tradedAt: string }) {
    db.prepare(
      `INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`
    ).run(positionId, input.type, input.quantity, input.price, input.totalFees ?? 0, input.currency, input.tradedAt);
  }

  insertBuyTransactionNow(positionId: number, input: { quantity: number; price: number; currency: string }) {
    db.prepare(
      `INSERT INTO transactions (position_id, type, quantity, price, currency, traded_at)
       VALUES (?, 'buy', ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(positionId, input.quantity, input.price, input.currency);
  }

  updateManualTransaction(positionId: number, transactionId: number, input: { type: "buy" | "sell"; quantity: number; price: number; totalFees?: number; currency: string; tradedAt: string }) {
    db.prepare(
      `UPDATE transactions
       SET traded_at = ?, type = ?, quantity = ?, price = ?, total_fees = ?, currency = ?
       WHERE id = ? AND position_id = ?`
    ).run(input.tradedAt, input.type, input.quantity, input.price, input.totalFees ?? 0, input.currency, transactionId, positionId);
  }

  deleteTransaction(positionId: number, transactionId: number) {
    db.prepare("DELETE FROM transactions WHERE id = ? AND position_id = ?").run(transactionId, positionId);
  }

  positionSymbols(userId?: number | string) {
    return this.listPositions(userId).map((row) => row.symbol.toUpperCase());
  }
}

export const portfolioRepository = new PortfolioRepository();
