import type { Response } from "express";
import type { MarketEventPayload, MarketEventType } from "@pea/shared";
import { db } from "../../../db.js";
import { logger } from "../../shared/logger.service.js";

// Types partagés via @pea/shared : `MarketEventType` et `MarketEventPayload` sont définis
// dans shared/src/market.ts pour empêcher toute divergence avec le frontend.
export type { MarketEventPayload, MarketEventType } from "@pea/shared";

interface Client {
  id: number;
  userId: string;
  res: Response;
}

const portfolioRefreshEvents: MarketEventType[] = [
  "portfolio-market-updated",
  "portfolio-assets-updated",
  "portfolio-chart-updated",
  "portfolio-performance-updated",
  "dashboard-chart-updated",
  "analysis-updated",
  "dividends-updated"
];
const watchlistRefreshEvents: MarketEventType[] = ["watchlist-market-updated", "watchlist-assets-updated", "watchlist-chart-updated"];

function formatEvent(event: MarketEventType, payload: Omit<MarketEventPayload, "type">) {
  return `event: ${event}\ndata: ${JSON.stringify({ type: event, ...payload })}\n\n`;
}

export class MarketEventsService {
  private clients = new Map<number, Client>();
  private nextClientId = 1;
  private readonly maxClients = 100;

  connect(userId: string | number, res: Response) {
    if (this.clients.size >= this.maxClients) {
      logger.warn("market-data", "market SSE rejected because client limit is reached", { userId, clients: this.clients.size, maxClients: this.maxClients });
      res.status(503).end();
      return;
    }
    const id = this.nextClientId++;
    const client: Client = { id, userId: String(userId), res };
    this.clients.set(id, client);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    this.write(client, "scheduler-health-updated", {
      type: "scheduler-health-updated",
      markets: [],
      updatedAt: new Date().toISOString()
    });

    const heartbeat = setInterval(() => {
      if (!this.clients.has(id)) return;
      res.write(`: ping ${new Date().toISOString()}\n\n`);
    }, 25_000);

    res.on("close", () => {
      clearInterval(heartbeat);
      this.clients.delete(id);
    });
  }

  emitMarketRefresh(input: { markets: string[]; symbols: string[]; updatedAt?: string }) {
    if (this.clients.size === 0 || input.symbols.length === 0) return;
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    const markets = [...new Set(input.markets)];
    const users = this.usersForSymbols(input.symbols);
    if (!users.size) return;

    // Les événements sont sérialisés une seule fois puis envoyés en un seul write par client,
    // au lieu de deux writes par événement (jusqu'à 22 écritures socket par rafraîchissement).
    const snapshotChunk = formatEvent("market-snapshot-updated", { markets, updatedAt });
    const portfolioChunk = portfolioRefreshEvents
      .map((event) => formatEvent(event, event === "portfolio-performance-updated" ? { markets, range: "1d", updatedAt } : { markets, updatedAt }))
      .join("");
    const watchlistChunk = watchlistRefreshEvents.map((event) => formatEvent(event, { markets, updatedAt })).join("");

    for (const client of this.clients.values()) {
      const impact = users.get(client.userId);
      if (!impact) continue;
      this.writeChunk(client, `${snapshotChunk}${impact.portfolio ? portfolioChunk : ""}${impact.watchlist ? watchlistChunk : ""}`);
    }
  }

  emitToUser(userId: string | number, event: MarketEventType, payload: Omit<MarketEventPayload, "type"> = {}) {
    const target = String(userId);
    for (const client of this.clients.values()) {
      if (client.userId === target) this.write(client, event, { type: event, ...payload });
    }
  }

  emitToAll(event: MarketEventType, payload: Omit<MarketEventPayload, "type"> = {}) {
    for (const client of this.clients.values()) {
      this.write(client, event, { type: event, ...payload });
    }
  }

  stats() {
    return { clients: this.clients.size, maxClients: this.maxClients };
  }

  private usersForSymbols(symbols: string[]) {
    const keys = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
    const result = new Map<string, { portfolio: boolean; watchlist: boolean }>();
    if (!keys.length) return result;
    const placeholders = keys.map(() => "?").join(",");

    const positions = db
      .prepare(`SELECT DISTINCT user_id FROM positions WHERE symbol IN (${placeholders})`)
      .all(...keys) as Array<{ user_id: string | number }>;
    for (const row of positions) {
      const userId = String(row.user_id);
      result.set(userId, { ...(result.get(userId) ?? { portfolio: false, watchlist: false }), portfolio: true });
    }

    const watchlist = db
      .prepare(`SELECT DISTINCT user_id FROM watchlist WHERE symbol IN (${placeholders})`)
      .all(...keys) as Array<{ user_id: string | number }>;
    for (const row of watchlist) {
      const userId = String(row.user_id);
      result.set(userId, { ...(result.get(userId) ?? { portfolio: false, watchlist: false }), watchlist: true });
    }

    return result;
  }

  private write(client: Client, event: MarketEventType, payload: MarketEventPayload) {
    this.writeChunk(client, formatEvent(event, payload));
  }

  private writeChunk(client: Client, chunk: string) {
    try {
      client.res.write(chunk);
    } catch (error) {
      logger.warn("market-data", "market SSE write failed", { userId: client.userId, error: error instanceof Error ? error.message : String(error) });
      this.clients.delete(client.id);
    }
  }
}

export const marketEventsService = new MarketEventsService();
