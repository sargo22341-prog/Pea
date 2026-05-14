import type { Position } from "@pea/shared";
import { db } from "../../db.js";

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

export interface PortfolioTransactionInsert {
  positionId: number;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  currency: string;
  tradedAt: string;
  sourceFileName?: string | null;
  assetName?: string | null;
  isin?: string | null;
  ticker?: string | null;
  totalFees?: number | null;
  rawTextSnippet?: string | null;
}

export interface UserAssetPositionRow {
  user_id: string;
  symbol: string;
  quantity: number;
  average_price: number;
  transaction_count: number;
  total_fees: number;
  invested_amount: number;
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

function ensureUserId(userId: number | string): number {
  const numeric = Number(userId);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`PortfolioRepository: userId invalide (${userId})`);
  }
  return Math.floor(numeric);
}

/**
 * Repository portfolio.
 *
 * Toutes les méthodes touchant `user_id` exigent désormais un userId explicite et numérique.
 * Le fallback historique vers `defaultSingleUserId=1` a été supprimé : un userId manquant lève
 * désormais une erreur claire pour empêcher tout accès cross-user silencieux.
 *
 * Les méthodes opérant par `positionId` (transactions) ne prennent pas userId : c'est la
 * responsabilité du service appelant de vérifier au préalable que la position appartient bien à
 * l'utilisateur courant via `findPositionById(positionId, userId)`.
 */
export class PortfolioRepository {
  listPositions(userId: number | string): PositionRow[] {
    return db.prepare("SELECT * FROM positions WHERE user_id = ? ORDER BY symbol ASC").all(ensureUserId(userId)) as PositionRow[];
  }

  findPositionBySymbol(symbol: string, userId: number | string): PositionRow | undefined {
    return db.prepare("SELECT * FROM positions WHERE user_id = ? AND symbol = ?").get(ensureUserId(userId), symbol.toUpperCase()) as PositionRow | undefined;
  }

  findPositionById(positionId: number, userId: number | string): PositionRow | undefined {
    return db.prepare("SELECT * FROM positions WHERE user_id = ? AND id = ?").get(ensureUserId(userId), positionId) as PositionRow | undefined;
  }

  insertPosition(input: { symbol: string; name: string; quantity: number; averageBuyPrice: number; currency: string }, userId: number | string) {
    db.prepare(
      `INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(ensureUserId(userId), input.symbol, input.name, input.quantity, input.averageBuyPrice, input.currency);
  }

  insertEmptyPosition(input: { symbol: string; name: string; currency: string }, userId: number | string) {
    db.prepare(
      `INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency)
       VALUES (?, ?, ?, 0, 0, ?)`
    ).run(ensureUserId(userId), input.symbol.toUpperCase(), input.name, input.currency);
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

  replaceImportedPositionSnapshot(positionId: number, input: { name: string; quantity: number; averageBuyPrice: number; currency: string }) {
    db.prepare(
      `UPDATE positions
       SET name = ?, quantity = ?, average_buy_price = ?, currency = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(input.name, input.quantity, input.averageBuyPrice, input.currency, positionId);
  }

  deletePosition(positionId: number, userId: number | string) {
    return db.prepare("DELETE FROM positions WHERE user_id = ? AND id = ?").run(ensureUserId(userId), positionId);
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

  insertImportedAvisTransaction(input: PortfolioTransactionInsert) {
    db.prepare(
      `INSERT INTO transactions (
        position_id, type, quantity, price, currency, traded_at, source, source_file_name,
        asset_name, isin, ticker, total_fees, raw_text_snippet
      ) VALUES (?, ?, ?, ?, ?, ?, 'pdf_avis_opere', ?, ?, ?, ?, ?, ?)`
    ).run(
      input.positionId,
      input.type,
      input.quantity,
      input.price,
      input.currency,
      input.tradedAt,
      input.sourceFileName ?? null,
      input.assetName ?? null,
      input.isin ?? null,
      input.ticker ?? null,
      input.totalFees ?? null,
      input.rawTextSnippet ?? null
    );
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

  transactionExists(positionId: number, transactionId: number) {
    return Boolean(db.prepare("SELECT id FROM transactions WHERE id = ? AND position_id = ?").get(transactionId, positionId));
  }

  hasDatedTransactions(positionId: number) {
    const row = db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE position_id = ? AND traded_at IS NOT NULL").get(positionId) as { count?: number } | undefined;
    return Number(row?.count ?? 0) > 0;
  }

  listQuantityEvents(positionId: number) {
    return db
      .prepare("SELECT type, quantity, traded_at FROM transactions WHERE position_id = ? AND traded_at IS NOT NULL ORDER BY traded_at ASC")
      .all(positionId) as Array<{ type: string; quantity: number; traded_at: string }>;
  }

  listRecomputeRows(positionId: number) {
    return db
      .prepare("SELECT type, quantity, price, total_fees FROM transactions WHERE position_id = ? ORDER BY traded_at ASC, id ASC")
      .all(positionId) as Array<{ type: string; quantity: number; price: number; total_fees?: number }>;
  }

  resetPositionValuation(positionId: number) {
    db.prepare("UPDATE positions SET quantity = 0, average_buy_price = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(positionId);
  }

  updatePositionValuation(positionId: number, quantity: number, averageBuyPrice: number) {
    db.prepare("UPDATE positions SET quantity = ?, average_buy_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(quantity, averageBuyPrice, positionId);
  }

  findUserAssetPosition(userId: string | number, symbol: string): UserAssetPositionRow | undefined {
    return db.prepare("SELECT * FROM user_assets WHERE user_id = ? AND symbol = ?").get(String(ensureUserId(userId)), symbol.toUpperCase()) as UserAssetPositionRow | undefined;
  }

  upsertUserAssetPosition(input: UserAssetPositionRow & { updatedAt: number }) {
    db.prepare(
      `INSERT INTO user_assets (user_id, symbol, quantity, average_price, transaction_count, total_fees, invested_amount, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, symbol) DO UPDATE SET quantity = excluded.quantity, average_price = excluded.average_price, transaction_count = excluded.transaction_count, total_fees = excluded.total_fees, invested_amount = excluded.invested_amount, updated_at = excluded.updated_at`
    ).run(input.user_id, input.symbol, input.quantity, input.average_price, input.transaction_count, input.total_fees, input.invested_amount, input.updatedAt);
  }

  positionSymbols(userId: number | string) {
    return this.listPositions(userId).map((row) => row.symbol.toUpperCase());
  }
}

export const portfolioRepository = new PortfolioRepository();
