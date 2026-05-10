import type { Response } from "express";
import { db } from "../../db.js";
import { config } from "../../config.js";
import { logger } from "../shared/logger.service.js";

export type MarketEventType =
  | "market-snapshot-updated"
  | "portfolio-market-updated"
  | "watchlist-market-updated"
  | "portfolio-assets-updated"
  | "watchlist-assets-updated"
  | "portfolio-chart-refresh-started"
  | "asset-chart-refresh-started"
  | "watchlist-chart-refresh-started"
  | "portfolio-chart-updated"
  | "asset-chart-updated"
  | "watchlist-chart-updated"
  | "dashboard-chart-updated"
  | "analysis-updated"
  | "dividends-updated"
  | "scheduler-health-updated";

export interface MarketEventPayload {
  type: MarketEventType;
  markets?: string[];
  symbols?: string[];
  symbol?: string;
  range?: string;
  updatedAt?: string;
  startedAt?: string;
}

interface Client {
  id: number;
  userId: string;
  res: Response;
}

export class MarketEventsService {
  private clients = new Map<number, Client>();
  private nextClientId = 1;

  connect(userId: string | number, res: Response) {
    if (!config.enableMarketSse) {
      res.status(404).json({ message: "SSE marche desactive." });
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
    if (!config.enableMarketSse || this.clients.size === 0 || input.symbols.length === 0) return;
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    const markets = [...new Set(input.markets)];
    const users = this.usersForSymbols(input.symbols);
    if (!users.size) return;

    for (const client of this.clients.values()) {
      if (!users.has(client.userId)) continue;
      this.write(client, "market-snapshot-updated", { type: "market-snapshot-updated", markets, updatedAt });
      if (users.get(client.userId)?.portfolio) {
        this.write(client, "portfolio-market-updated", { type: "portfolio-market-updated", markets, updatedAt });
        this.write(client, "portfolio-assets-updated", { type: "portfolio-assets-updated", markets, updatedAt });
        this.write(client, "portfolio-chart-updated", { type: "portfolio-chart-updated", markets, updatedAt });
        this.write(client, "dashboard-chart-updated", { type: "dashboard-chart-updated", markets, updatedAt });
        this.write(client, "analysis-updated", { type: "analysis-updated", markets, updatedAt });
        this.write(client, "dividends-updated", { type: "dividends-updated", markets, updatedAt });
      }
      if (users.get(client.userId)?.watchlist) {
        this.write(client, "watchlist-market-updated", { type: "watchlist-market-updated", markets, updatedAt });
        this.write(client, "watchlist-assets-updated", { type: "watchlist-assets-updated", markets, updatedAt });
        this.write(client, "watchlist-chart-updated", { type: "watchlist-chart-updated", markets, updatedAt });
      }
    }
  }

  emitToUser(userId: string | number, event: MarketEventType, payload: Omit<MarketEventPayload, "type"> = {}) {
    if (!config.enableMarketSse) return;
    const target = String(userId);
    for (const client of this.clients.values()) {
      if (client.userId === target) this.write(client, event, { type: event, ...payload });
    }
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
    try {
      client.res.write(`event: ${event}\n`);
      client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (error) {
      logger.warn("market-data", "market SSE write failed", { userId: client.userId, error: error instanceof Error ? error.message : String(error) });
      this.clients.delete(client.id);
    }
  }
}

export const marketEventsService = new MarketEventsService();
