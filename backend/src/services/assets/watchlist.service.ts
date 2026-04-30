/**
 * Role du fichier : gerer la watchlist et enrichir chaque actif avec sa quote
 * et son historique de prix pour l'affichage.
 */

import type { RangeKey, SearchResult, WatchlistItem } from "@pea/shared";
import { db } from "../../db.js";
import { marketDataService } from "../market/market-data.service.js";
import { marketSnapshotService } from "../market/market-snapshot.service.js";
import { isMarketDataUnavailable } from "../yahoo/index.js";

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
  async list(range: RangeKey = "1d"): Promise<WatchlistItem[]> {
    const rows = db.prepare("SELECT * FROM watchlist ORDER BY created_at DESC").all();
    return Promise.all(rows.map((row) => this.enrich(mapWatchlistRow(row), range)));
  }

  async add(symbol: string, input?: Partial<SearchResult>): Promise<WatchlistItem> {
    const key = symbol.toUpperCase();
    let name = input?.name || key;
    let exchange = input?.exchange;
    let currency = input?.currency;

    try {
      const quote = await marketSnapshotService.getQuote(key, { forceRefresh: true });
      name = quote.name || name;
      exchange = quote.exchange || exchange;
      currency = quote.currency || currency;
    } catch (error) {
      if (!isMarketDataUnavailable(error)) throw error;
    }

    db.prepare(
      `INSERT INTO watchlist (symbol, name, exchange, currency)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET name = excluded.name, exchange = excluded.exchange, currency = excluded.currency`
    ).run(key, name, exchange ?? null, currency ?? null);

    const row = db.prepare("SELECT * FROM watchlist WHERE symbol = ?").get(key);
    return this.enrich(mapWatchlistRow(row), "1d");
  }

  remove(symbol: string): boolean {
    const key = symbol.toUpperCase();
    const existing = db.prepare("SELECT id FROM watchlist WHERE symbol = ?").get(key);
    if (!existing) return false;
    db.prepare("DELETE FROM watchlist WHERE symbol = ?").run(key);
    return true;
  }

  private async enrich(item: WatchlistItem, range: RangeKey): Promise<WatchlistItem> {
    try {
      const [quote, chart] = await Promise.all([marketSnapshotService.getQuote(item.symbol), marketDataService.getChartData(item.symbol, range)]);
      return {
        ...item,
        name: item.name || quote.name,
        currency: item.currency || quote.currency,
        quote,
        history: chart.timestamps.map((timestamp, index) => ({ date: new Date(timestamp).toISOString(), close: chart.prices[index] })),
        marketDataUnavailable: Boolean(quote.stale || quote.unavailable)
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
