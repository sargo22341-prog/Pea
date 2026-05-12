/**
 * Role du fichier : gerer la watchlist et enrichir chaque actif avec sa quote
 * et son historique de prix pour l'affichage.
 */

import type { RangeKey, SearchResult, WatchlistItem } from "@pea/shared";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { currentUserId } from "../auth/user-context.js";
import { marketDataService } from "../market/data/market-data.service.js";
import { marketSnapshotService } from "../market/snapshots/market-snapshot.service.js";
import { chartConfigService } from "../market/charts/chart-config.service.js";
import { marketEventsService } from "../market/events/market-events.service.js";
import { frontendBlockCache } from "../shared/frontend-block-cache.service.js";
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
    const userId = currentUserId().toString();
    if (config.enableMarketLiveRefresh) {
      const cached = frontendBlockCache.read<WatchlistItem[]>(userId, "watchlist", range);
      if (cached) return cached;
    }
    const rows = db.prepare("SELECT * FROM watchlist WHERE user_id = ? ORDER BY created_at DESC").all(currentUserId());
    const payload = await Promise.all(rows.map((row) => this.enrich(mapWatchlistRow(row), range)));
    if (config.enableMarketLiveRefresh) frontendBlockCache.write(userId, "watchlist", payload, chartConfigService.getSnapshotRefreshIntervalMs(), range);
    return payload;
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
      `INSERT INTO watchlist (user_id, symbol, name, exchange, currency)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, symbol) DO UPDATE SET name = excluded.name, exchange = excluded.exchange, currency = excluded.currency`
    ).run(currentUserId(), key, name, exchange ?? null, currency ?? null);

    const row = db.prepare("SELECT * FROM watchlist WHERE user_id = ? AND symbol = ?").get(currentUserId(), key);
    this.invalidateWatchlistCache(currentUserId());
    marketEventsService.emitToUser(currentUserId(), "watchlist-assets-updated", { symbols: [key], updatedAt: new Date().toISOString() });
    return this.enrich(mapWatchlistRow(row), "1d");
  }

  remove(symbol: string): boolean {
    const key = symbol.toUpperCase();
    const existing = db.prepare("SELECT id FROM watchlist WHERE user_id = ? AND symbol = ?").get(currentUserId(), key);
    if (!existing) return false;
    db.prepare("DELETE FROM watchlist WHERE user_id = ? AND symbol = ?").run(currentUserId(), key);
    this.invalidateWatchlistCache(currentUserId());
    marketEventsService.emitToUser(currentUserId(), "watchlist-assets-updated", { symbols: [key], updatedAt: new Date().toISOString() });
    return true;
  }

  private invalidateWatchlistCache(userId: string | number) {
    frontendBlockCache.invalidate({ userId, block: "watchlist" });
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
