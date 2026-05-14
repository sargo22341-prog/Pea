import { db } from "../../db.js";

export interface WatchlistRow {
  id: number;
  user_id: number | string;
  symbol: string;
  name: string;
  exchange?: string | null;
  currency?: string | null;
  created_at: string;
}

function ensureUserId(userId: number | string): number {
  const numeric = Number(userId);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`WatchlistRepository: userId invalide (${userId})`);
  }
  return Math.floor(numeric);
}

/**
 * Repository watchlist : userId obligatoire pour toutes les opérations par utilisateur.
 * `distinctUserIdsForSymbols` reste cross-user pour les besoins du scheduler live-refresh.
 */
export class WatchlistRepository {
  list(userId: number | string): WatchlistRow[] {
    return db.prepare("SELECT * FROM watchlist WHERE user_id = ? ORDER BY created_at DESC").all(ensureUserId(userId)) as WatchlistRow[];
  }

  find(symbol: string, userId: number | string): WatchlistRow | undefined {
    return db.prepare("SELECT * FROM watchlist WHERE user_id = ? AND symbol = ?").get(ensureUserId(userId), symbol.toUpperCase()) as WatchlistRow | undefined;
  }

  has(symbol: string, userId: number | string): boolean {
    return Boolean(db.prepare("SELECT id FROM watchlist WHERE user_id = ? AND symbol = ?").get(ensureUserId(userId), symbol.toUpperCase()));
  }

  upsert(input: { symbol: string; name: string; exchange?: string | null; currency?: string | null }, userId: number | string) {
    db.prepare(
      `INSERT INTO watchlist (user_id, symbol, name, exchange, currency)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, symbol) DO UPDATE SET name = excluded.name, exchange = excluded.exchange, currency = excluded.currency`
    ).run(ensureUserId(userId), input.symbol.toUpperCase(), input.name, input.exchange ?? null, input.currency ?? null);
  }

  remove(symbol: string, userId: number | string) {
    return db.prepare("DELETE FROM watchlist WHERE user_id = ? AND symbol = ?").run(ensureUserId(userId), symbol.toUpperCase());
  }

  /** Cross-user : utilisé par le scheduler pour identifier quels utilisateurs notifier. */
  distinctUserIdsForSymbols(symbols: string[]): Array<string | number> {
    if (!symbols.length) return [];
    const placeholders = symbols.map(() => "?").join(",");
    const rows = db.prepare(`SELECT DISTINCT user_id FROM watchlist WHERE symbol IN (${placeholders})`).all(...symbols) as Array<{ user_id: string | number }>;
    return rows.map((row) => row.user_id);
  }

  symbols(userId: number | string): string[] {
    return this.list(userId).map((row) => row.symbol.toUpperCase());
  }
}

export const watchlistRepository = new WatchlistRepository();
