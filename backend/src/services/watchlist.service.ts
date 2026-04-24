import type { SearchResult, WatchlistItem } from "@pea/shared";
import { db } from "../db.js";
import { isMarketDataUnavailable, yahooService } from "./yahoo.service.js";

function mapWatchlistRow(row: any): WatchlistItem {
  return {
    id: Number(row.id),
    symbol: String(row.symbol),
    name: String(row.name),
    exchange: row.exchange ? String(row.exchange) : undefined,
    currency: row.currency ? String(row.currency) : undefined,
    createdAt: String(row.created_at),
    history: []
  };
}

export class WatchlistService {
  async list(): Promise<WatchlistItem[]> {
    const rows = db.prepare("SELECT * FROM watchlist ORDER BY created_at DESC").all();
    return Promise.all(rows.map((row) => this.enrich(mapWatchlistRow(row))));
  }

  async add(symbol: string, input?: Partial<SearchResult>): Promise<WatchlistItem> {
    const key = symbol.toUpperCase();
    let name = input?.name || key;
    let exchange = input?.exchange;
    let currency = input?.currency;

    try {
      const quote = await yahooService.quote(key);
      name = quote.data.name || name;
      exchange = quote.data.exchange || exchange;
      currency = quote.data.currency || currency;
    } catch (error) {
      if (!isMarketDataUnavailable(error)) throw error;
    }

    db.prepare(
      `INSERT INTO watchlist (symbol, name, exchange, currency)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET name = excluded.name, exchange = excluded.exchange, currency = excluded.currency`
    ).run(key, name, exchange ?? null, currency ?? null);

    const row = db.prepare("SELECT * FROM watchlist WHERE symbol = ?").get(key);
    return this.enrich(mapWatchlistRow(row));
  }

  remove(symbol: string): boolean {
    const key = symbol.toUpperCase();
    const existing = db.prepare("SELECT id FROM watchlist WHERE symbol = ?").get(key);
    if (!existing) return false;
    db.prepare("DELETE FROM watchlist WHERE symbol = ?").run(key);
    return true;
  }

  private async enrich(item: WatchlistItem): Promise<WatchlistItem> {
    try {
      const [quote, history] = await Promise.all([yahooService.quote(item.symbol), yahooService.history(item.symbol, "1d")]);
      return {
        ...item,
        name: item.name || quote.data.name,
        currency: item.currency || quote.data.currency,
        quote: quote.data,
        history: history.data,
        marketDataUnavailable: quote.stale || history.stale || quote.data.unavailable
      };
    } catch (error) {
      if (!isMarketDataUnavailable(error)) throw error;
      return {
        ...item,
        history: [],
        marketDataUnavailable: true
      };
    }
  }
}

export const watchlistService = new WatchlistService();
