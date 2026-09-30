import type { Response } from "express";
import type { MarketEventPayload, MarketEventType } from "@pea/shared";
import { liveRefreshRepository } from "../../../repositories/market/live-refresh.repository.js";
import { logger } from "../../shared/logger.service.js";

// Types partagés via @pea/shared : `MarketEventType` et `MarketEventPayload` sont définis
// dans shared/src/market.ts pour empêcher toute divergence avec le frontend.
export type { MarketEventPayload, MarketEventType } from "@pea/shared";

interface Client {
  id: number;
  userId: string;
  /** Empreinte de la session qui a ouvert le flux, pour le fermer à la déconnexion. */
  sessionKey: string;
  res: Response;
  heartbeat: NodeJS.Timeout;
}

/** Flux simultanés au total : protège le serveur (descripteurs, mémoire). */
const maxClients = 100;
/** Flux simultanés par utilisateur : un compte ou une boucle de reconnexion ne bloque pas les autres. */
const maxClientsPerUser = 10;
const heartbeatIntervalMs = 25_000;

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

  connect(userId: string | number, sessionKey: string, res: Response) {
    const key = String(userId);
    const userClients = [...this.clients.values()].filter((client) => client.userId === key);
    // Au-delà de la limite par utilisateur, le flux le plus ancien de ce compte laisse sa place.
    const oldestUserClient = userClients[0];
    if (oldestUserClient && userClients.length >= maxClientsPerUser) this.close(oldestUserClient);
    if (this.clients.size >= maxClients) {
      logger.warn("market-data", "market SSE rejected because client limit is reached", { userId, clients: this.clients.size, maxClients });
      res.status(503).end();
      return;
    }
    const id = this.nextClientId++;
    const heartbeat = setInterval(() => { res.write(`: ping ${new Date().toISOString()}\n\n`); }, heartbeatIntervalMs);
    const client: Client = { id, userId: key, sessionKey, res, heartbeat };
    this.clients.set(id, client);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // nginx (Nginx Proxy Manager) bufferise les réponses proxifiées : sans cet en-tête,
    // les événements SSE restent bloqués côté proxy au lieu d'être transmis immédiatement.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    this.write(client, "scheduler-health-updated", {
      type: "scheduler-health-updated",
      markets: [],
      updatedAt: new Date().toISOString()
    });

    res.on("close", () => { this.forget(client); });
  }

  /** Ferme les flux ouverts par une session (déconnexion). */
  disconnectSession(sessionKey: string) {
    for (const client of this.clients.values()) {
      if (client.sessionKey === sessionKey) this.close(client);
    }
  }

  /** Ferme tous les flux d'un utilisateur (sessions révoquées ou compte supprimé). */
  disconnectUser(userId: string | number) {
    const key = String(userId);
    for (const client of this.clients.values()) {
      if (client.userId === key) this.close(client);
    }
  }

  /** Ferme tous les flux, pour permettre l'arrêt du serveur HTTP. */
  closeAll() {
    for (const client of this.clients.values()) this.close(client);
  }

  emitMarketRefresh(input: { markets: string[]; symbols: string[]; updatedAt?: string }) {
    if (this.clients.size === 0 || input.symbols.length === 0) return;
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    const markets = [...new Set(input.markets)];
    const users = liveRefreshRepository.userImpactsForSymbols(input.symbols);
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
    return { clients: this.clients.size, maxClients, maxClientsPerUser };
  }

  private close(client: Client) {
    this.forget(client);
    client.res.end();
  }

  private forget(client: Client) {
    clearInterval(client.heartbeat);
    this.clients.delete(client.id);
  }

  private write(client: Client, event: MarketEventType, payload: MarketEventPayload) {
    this.writeChunk(client, formatEvent(event, payload));
  }

  private writeChunk(client: Client, chunk: string) {
    try {
      client.res.write(chunk);
    } catch (error) {
      logger.warn("market-data", "market SSE write failed", { userId: client.userId, error: error instanceof Error ? error.message : String(error) });
      this.forget(client);
    }
  }
}

export const marketEventsService = new MarketEventsService();
