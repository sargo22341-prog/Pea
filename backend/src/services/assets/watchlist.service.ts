import type { RangeKey, SearchResult, WatchlistItem } from "@pea/shared";
import { config } from "../../config.js";
import { watchlistRepository, type WatchlistRow } from "../../repositories/assets/watchlist.repository.js";
import { currentUserId } from "../auth/user-context.js";
import { marketDataService } from "../market/data/market-data.service.js";
import { marketSnapshotService } from "../market/snapshots/market-snapshot.service.js";
import { chartConfigService } from "../market/charts/chart-config.service.js";
import { marketEventsService } from "../market/events/market-events.service.js";
import { frontendBlockCache } from "../shared/frontend-block-cache.service.js";
import { invalidateFrontendBlockCache } from "../shared/cache.service.js";
import { isMarketDataUnavailable } from "../yahoo/index.js";

function mapWatchlistRow(row: WatchlistRow): WatchlistItem {
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
    const rows = watchlistRepository.list();
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

    watchlistRepository.upsert({ symbol: key, name, exchange, currency });

    const row = watchlistRepository.find(key);
    if (!row) throw new Error("Watchlist introuvable apres insertion.");
    this.invalidateWatchlistCache(currentUserId());
    marketEventsService.emitToUser(currentUserId(), "watchlist-assets-updated", { symbols: [key], updatedAt: new Date().toISOString() });
    return this.enrich(mapWatchlistRow(row), "1d");
  }

  remove(symbol: string): boolean {
    const key = symbol.toUpperCase();
    if (!watchlistRepository.has(key)) return false;
    watchlistRepository.remove(key);
    this.invalidateWatchlistCache(currentUserId());
    marketEventsService.emitToUser(currentUserId(), "watchlist-assets-updated", { symbols: [key], updatedAt: new Date().toISOString() });
    return true;
  }

  private invalidateWatchlistCache(userId: string | number) {
    invalidateFrontendBlockCache({ userId, block: "watchlist" });
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
