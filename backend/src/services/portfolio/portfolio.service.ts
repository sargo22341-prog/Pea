/**
 * Rôle du fichier : gérer les positions, transactions et agrégations de portefeuille.
 * Le service calcule les DTO prêts à afficher et invalide les caches utilisateur.
 */

import type { CreatePositionInput, EditablePortfolioTransaction, HistoryPoint, MarketSessionDto, PortfolioChartDto, PortfolioPerformancePoint, PortfolioSummary, PortfolioTransactionMarker, Position, PositionRangePerformance, PositionTransactionStats, PositionWithMarket, Quote, RangeKey, UpdatePositionInput, UserAssetPositionDto } from "@pea/shared";
import { z } from "zod";
import { db } from "../../db.js";
import { HttpError } from "../../utils/http-error.js";
import { assetRepository } from "../market/asset.repository.js";
import { dataConstructionQueue } from "../market/data-construction-queue.service.js";
import { dividendsService } from "../market/dividends.service.js";
import { getMarketSessionInfo } from "../market/marketCalendar.service.js";
import { marketDataService } from "../market/market-data.service.js";
import { marketSnapshotService } from "../market/market-snapshot.service.js";
import { invalidateUserAssetCaches, nowMs, toDisplayRange } from "../shared/cache.service.js";
import { logger } from "../shared/logger.service.js";
import { isMarketDataUnavailable } from "../yahoo/index.js";
import { calculateTransactionStats, legacyTransactionFromPosition } from "./portfolioTransactions.service.js";

const createPositionSchema = z.object({
  symbol: z.string().trim().min(1).max(24),
  name: z.string().trim().optional(),
  quantity: z.number().positive(),
  averageBuyPrice: z.number().nonnegative(),
  currency: z.string().trim().min(3).max(8).default("EUR"),
  notes: z.string().trim().optional()
});

const portfolioTransactionMarkerRanges = new Set<RangeKey>(["1w", "1m", "ytd", "1y", "5y", "10y", "all", "max"]);
export interface PortfolioMarketDataOptions {
  forceIntradayOpen?: boolean;
  intradayNow?: Date;
}

type TransactionMutationInput = {
  tradedAt: string;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  totalFees?: number;
  currency: string;
};

type TransactionSequenceRow = {
  id?: number;
  type: string;
  quantity: number;
  price: number;
  total_fees?: number;
  traded_at: string;
};

/**
 * Convertit une ligne SQLite de position en contrat partagé.
 *
 * @param row Ligne issue de la table positions.
 * @returns Position normalisée pour les services et réponses API.
 */
function mapPosition(row: any): Position {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    quantity: row.quantity,
    averageBuyPrice: row.average_buy_price,
    currency: row.currency,
    notes: row.notes ?? undefined,
    createdAt: row.created_at
  };
}

/**
 * Calcule un identifiant utilisateur stable pour les caches historiques mono-utilisateur.
 *
 * @param userId Identifiant utilisateur éventuel fourni par l'authentification.
 * @returns Identifiant texte compatible avec les clés de cache.
 */
function normalizedUserId(userId?: string | number) {
  return String(userId ?? "default");
}

function nearestTimestamp(target: number, sortedTimestamps: number[]) {
  let nearest = sortedTimestamps[0];
  let nearestDistance = Math.abs(nearest - target);
  for (const timestamp of sortedTimestamps) {
    const distance = Math.abs(timestamp - target);
    if (distance >= nearestDistance) continue;
    nearest = timestamp;
    nearestDistance = distance;
  }
  return nearest;
}

function isTransactionVisibleInRange(transactionDate: string, transactionTime: number, firstTimestamp: number, lastTimestamp: number, range: RangeKey) {
  if (range === "1w" || range === "1m") return transactionTime >= firstTimestamp && transactionTime <= lastTimestamp;
  const transactionDay = transactionDate.slice(0, 10);
  const firstDay = new Date(firstTimestamp).toISOString().slice(0, 10);
  const lastDay = new Date(lastTimestamp).toISOString().slice(0, 10);
  return transactionDay >= firstDay && transactionDay <= lastDay;
}

export class PortfolioService {
  listPositions(): Position[] {
    const rows = db.prepare("SELECT * FROM positions ORDER BY symbol ASC").all();
    return rows.map(mapPosition);
  }

  async getPosition(symbol: string): Promise<PositionWithMarket | undefined> {
    const row = db.prepare("SELECT * FROM positions WHERE symbol = ?").get(symbol.toUpperCase());
    if (!row) return undefined;
    return this.enrichPosition(mapPosition(row));
  }

  async createPosition(input: CreatePositionInput, options: { scheduleConstruction?: boolean } = {}): Promise<PositionWithMarket> {
    const parsed = createPositionSchema.parse({
      ...input,
      symbol: input.symbol.toUpperCase()
    });

    let quoteName: string | undefined;
    try {
      const quote = await marketSnapshotService.getQuote(parsed.symbol, { forceRefresh: true });
      quoteName = quote.name;
    } catch (error) {
      if (!isMarketDataUnavailable(error)) {
        throw error;
      }
    }

    const name = parsed.name || quoteName || parsed.symbol;
    const existing = db.prepare("SELECT * FROM positions WHERE symbol = ?").get(parsed.symbol) as any;

    if (existing) {
      const oldQuantity = Number(existing.quantity);
      const newQuantity = oldQuantity + parsed.quantity;
      const weightedAverage =
        newQuantity === 0
          ? parsed.averageBuyPrice
          : (oldQuantity * Number(existing.average_buy_price) + parsed.quantity * parsed.averageBuyPrice) / newQuantity;

      db.prepare(
        `UPDATE positions
         SET quantity = ?, average_buy_price = ?, name = ?, currency = ?, updated_at = CURRENT_TIMESTAMP
         WHERE symbol = ?`
      ).run(newQuantity, weightedAverage, name, parsed.currency, parsed.symbol);
    } else {
      db.prepare(
        `INSERT INTO positions (symbol, name, quantity, average_buy_price, currency)
         VALUES (?, ?, ?, ?, ?)`
      ).run(parsed.symbol, name, parsed.quantity, parsed.averageBuyPrice, parsed.currency);
    }

    const position = db.prepare("SELECT * FROM positions WHERE symbol = ?").get(parsed.symbol) as any;
    await marketDataService.ensureAssetInitialized(parsed.symbol);
    if (options.scheduleConstruction !== false) dataConstructionQueue.enqueueAssetConstruction(parsed.symbol);
    db.prepare(
      `INSERT INTO transactions (position_id, type, quantity, price, currency, traded_at)
       VALUES (?, 'buy', ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(position.id, parsed.quantity, parsed.averageBuyPrice, parsed.currency);
    this.invalidatePositionCaches(position.id, parsed.symbol);

    return this.enrichPosition(mapPosition(position));
  }

  async ensurePosition(symbol: string, name: string, currency = "EUR"): Promise<Position> {
    const normalizedSymbol = symbol.toUpperCase();
    const existing = db.prepare("SELECT * FROM positions WHERE symbol = ?").get(normalizedSymbol) as any;
    if (existing) return mapPosition(existing);
    db.prepare(
      `INSERT INTO positions (symbol, name, quantity, average_buy_price, currency)
       VALUES (?, ?, 0, 0, ?)`
    ).run(normalizedSymbol, name, currency);
    const created = db.prepare("SELECT * FROM positions WHERE symbol = ?").get(normalizedSymbol) as any;
    return mapPosition(created);
  }

  hasDatedTransactions(positionId: number): boolean {
    const row = db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE position_id = ? AND traded_at IS NOT NULL").get(positionId) as any;
    return Number(row?.count ?? 0) > 0;
  }

  getQuantityHeldAtDate(assetId: number | string, date: string): number {
    const time = new Date(date).getTime();
    if (!Number.isFinite(time)) return 0;
    const rows = db
      .prepare("SELECT type, quantity, traded_at FROM transactions WHERE position_id = ? AND traded_at IS NOT NULL ORDER BY traded_at ASC")
      .all(assetId) as Array<{ type: string; quantity: number; traded_at: string }>;
    return rows.reduce((quantity, row) => {
      if (new Date(row.traded_at).getTime() > time) return quantity;
      if (row.type === "buy") return quantity + Number(row.quantity);
      if (row.type === "sell") return quantity - Number(row.quantity);
      return quantity;
    }, 0);
  }

  private getCostBasisHeldAtDate(positionId: number, date: string): number {
    const time = new Date(date).getTime();
    if (!Number.isFinite(time)) return 0;
    const rows = db
      .prepare("SELECT type, quantity, price, total_fees, traded_at FROM transactions WHERE position_id = ? AND traded_at IS NOT NULL ORDER BY traded_at ASC, id ASC")
      .all(positionId) as Array<{ type: string; quantity: number; price: number; total_fees?: number; traded_at: string }>;

    let quantity = 0;
    let costBasis = 0;
    for (const row of rows) {
      if (new Date(row.traded_at).getTime() > time) continue;
      const rowQuantity = Number(row.quantity);
      if (row.type === "buy") {
        quantity += rowQuantity;
        costBasis += rowQuantity * Number(row.price) + Number(row.total_fees ?? 0);
      } else if (row.type === "sell") {
        const averageCost = quantity > 0 ? costBasis / quantity : 0;
        quantity -= rowQuantity;
        costBasis = Math.max(0, costBasis - averageCost * rowQuantity);
      }
    }

    return costBasis;
  }

  recomputePositionFromDatedTransactions(positionId: number) {
    const rows = db
      .prepare("SELECT type, quantity, price, total_fees FROM transactions WHERE position_id = ? ORDER BY traded_at ASC, id ASC")
      .all(positionId) as Array<{ type: string; quantity: number; price: number; total_fees?: number }>;
    if (!rows.length) return;

    let quantity = 0;
    let costBasis = 0;
    for (const row of rows) {
      const rowQuantity = Number(row.quantity);
      if (row.type === "buy") {
        const buyCost = rowQuantity * Number(row.price) + Number(row.total_fees ?? 0);
        quantity += rowQuantity;
        costBasis += buyCost;
      } else if (row.type === "sell") {
        const averageCost = quantity > 0 ? costBasis / quantity : 0;
        quantity -= rowQuantity;
        costBasis = Math.max(0, costBasis - averageCost * rowQuantity);
      }
    }

    const averageBuyPrice = quantity > 0 ? costBasis / quantity : 0;
    db.prepare(
      `UPDATE positions
       SET quantity = ?, average_buy_price = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(quantity, averageBuyPrice, positionId);
  }

  listTransactions(positionId: number): EditablePortfolioTransaction[] {
    const rows = db.prepare("SELECT * FROM transactions WHERE position_id = ? ORDER BY traded_at DESC, id DESC").all(positionId) as any[];
    if (!rows.length) {
      const position = db.prepare("SELECT * FROM positions WHERE id = ?").get(positionId) as any;
      if (!position) return [];
      return [legacyTransactionFromPosition(mapPosition(position))];
    }

    return rows.map((row) => ({
      id: String(row.id),
      positionId: Number(row.position_id),
      assetId: String(row.position_id),
      source: row.source === "pdf_avis_opere" || row.source === "csv" ? row.source : "manual",
      sourceFileName: row.source_file_name ?? undefined,
      dateExecution: row.traded_at,
      tradedAt: row.traded_at,
      assetName: row.asset_name ?? undefined,
      isin: row.isin ?? undefined,
      ticker: row.ticker ?? undefined,
      type: row.type,
      quantity: Number(row.quantity),
      executedPrice: Number(row.price),
      price: Number(row.price),
      totalFees: row.total_fees == null ? undefined : Number(row.total_fees),
      currency: row.currency,
      rawTextSnippet: row.raw_text_snippet ?? undefined,
      createdAt: row.traded_at
    }));
  }

  transactionStats(positionId: number, totalDividendsReceived = 0, currency = "EUR"): PositionTransactionStats {
    const rows = this.listTransactions(positionId);
    return calculateTransactionStats(rows, totalDividendsReceived, currency);
  }

  createTransaction(positionId: number, input: TransactionMutationInput) {
    const position = db.prepare("SELECT id FROM positions WHERE id = ?").get(positionId);
    if (!position) throw new HttpError(404, "Position introuvable");
    this.assertValidTransactionMutation(positionId, input);
    db.prepare(
      `INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`
    ).run(positionId, input.type, input.quantity, input.price, input.totalFees ?? 0, input.currency, input.tradedAt);
    this.recomputePositionFromAnyTransactions(positionId);
    this.invalidatePositionCaches(positionId);
    return this.listTransactions(positionId);
  }

  updateTransaction(positionId: number, transactionId: number, input: TransactionMutationInput) {
    const existing = db.prepare("SELECT id FROM transactions WHERE id = ? AND position_id = ?").get(transactionId, positionId);
    if (!existing) throw new HttpError(404, "Transaction introuvable");
    this.assertValidTransactionMutation(positionId, input, transactionId);
    db.prepare(
      `UPDATE transactions
       SET traded_at = ?, type = ?, quantity = ?, price = ?, total_fees = ?, currency = ?
       WHERE id = ? AND position_id = ?`
    ).run(input.tradedAt, input.type, input.quantity, input.price, input.totalFees ?? 0, input.currency, transactionId, positionId);
    this.recomputePositionFromAnyTransactions(positionId);
    this.invalidatePositionCaches(positionId);
    return this.listTransactions(positionId);
  }

  deleteTransaction(positionId: number, transactionId: number) {
    db.prepare("DELETE FROM transactions WHERE id = ? AND position_id = ?").run(transactionId, positionId);
    this.recomputePositionFromAnyTransactions(positionId);
    this.invalidatePositionCaches(positionId);
  }

  recomputePositionFromAnyTransactions(positionId: number) {
    const rows = db
      .prepare("SELECT type, quantity, price, total_fees FROM transactions WHERE position_id = ? ORDER BY traded_at ASC, id ASC")
      .all(positionId) as Array<{ type: string; quantity: number; price: number; total_fees?: number }>;
    if (!rows.length) {
      db.prepare("UPDATE positions SET quantity = 0, average_buy_price = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(positionId);
      this.persistUserAssetPosition("default", positionId);
      return;
    }

    let quantity = 0;
    let costBasis = 0;
    for (const row of rows) {
      const rowQuantity = Number(row.quantity);
      if (row.type === "buy") {
        const buyCost = rowQuantity * Number(row.price) + Number(row.total_fees ?? 0);
        quantity += rowQuantity;
        costBasis += buyCost;
      } else if (row.type === "sell") {
        const averageCost = quantity > 0 ? costBasis / quantity : 0;
        quantity -= rowQuantity;
        costBasis = Math.max(0, costBasis - averageCost * rowQuantity);
      }
    }

    db.prepare("UPDATE positions SET quantity = ?, average_buy_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(quantity, quantity > 0 ? costBasis / quantity : 0, positionId);
    this.persistUserAssetPosition("default", positionId);
  }

  assertValidTransactionMutation(positionId: number, input: TransactionMutationInput, transactionIdToReplace?: number) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new HttpError(400, "La quantite doit etre strictement positive.");
    }
    if (!Number.isFinite(input.price) || input.price < 0) {
      throw new HttpError(400, "Le prix doit etre positif ou nul.");
    }

    const rows = db
      .prepare("SELECT id, type, quantity, price, total_fees, traded_at FROM transactions WHERE position_id = ? ORDER BY traded_at ASC, id ASC")
      .all(positionId) as TransactionSequenceRow[];
    const mutation: TransactionSequenceRow = {
      id: transactionIdToReplace,
      type: input.type,
      quantity: input.quantity,
      price: input.price,
      total_fees: input.totalFees ?? 0,
      traded_at: input.tradedAt
    };
    const nextRows = transactionIdToReplace
      ? rows.map((row) => (Number(row.id) === transactionIdToReplace ? mutation : row))
      : [...rows, mutation];
    this.assertTransactionSequenceDoesNotGoNegative(nextRows);
  }

  private assertTransactionSequenceDoesNotGoNegative(rows: TransactionSequenceRow[]) {
    let quantity = 0;
    const sortedRows = [...rows].sort((a, b) => {
      const dateOrder = String(a.traded_at).localeCompare(String(b.traded_at));
      if (dateOrder !== 0) return dateOrder;
      return Number(a.id ?? Number.MAX_SAFE_INTEGER) - Number(b.id ?? Number.MAX_SAFE_INTEGER);
    });

    for (const row of sortedRows) {
      const rowQuantity = Number(row.quantity);
      if (row.type === "buy") quantity += rowQuantity;
      if (row.type === "sell") quantity -= rowQuantity;
      if (quantity < -0.000001) {
        throw new HttpError(400, "Cette vente rendrait la quantite detenue negative.");
      }
      if (Math.abs(quantity) < 0.000001) quantity = 0;
    }
  }

  deletePosition(id: number): boolean {
    const existing = db.prepare("SELECT id FROM positions WHERE id = ?").get(id);
    if (!existing) return false;
    this.invalidatePositionCaches(id);
    db.prepare("DELETE FROM positions WHERE id = ?").run(id);
    return true;
  }

  async updatePosition(id: number, input: UpdatePositionInput): Promise<PositionWithMarket> {
    const parsed = createPositionSchema
      .omit({ symbol: true, name: true })
      .parse(input);
    const existing = db.prepare("SELECT * FROM positions WHERE id = ?").get(id) as any;
    if (!existing) throw new HttpError(404, "Position introuvable");

    db.prepare(
      `UPDATE positions
       SET quantity = ?, average_buy_price = ?, currency = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(parsed.quantity, parsed.averageBuyPrice, parsed.currency, parsed.notes ?? null, id);
    this.invalidatePositionCaches(id);

    const row = db.prepare("SELECT * FROM positions WHERE id = ?").get(id) as any;
    return this.enrichPosition(mapPosition(row));
  }

  async summary(_range: RangeKey = "1d"): Promise<PortfolioSummary> {
    const basePositions = this.listPositions();
    const quotesBySymbol = await this.quotesForPositions(basePositions);
    const positions = basePositions.map((position) => this.enrichPositionWithQuote(position, quotesBySymbol.get(position.symbol.toUpperCase())));
    const totalValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
    const totalCost = positions.reduce((sum, position) => sum + position.costBasis, 0);
    const totalDividendsReceived = this.totalDividendsReceived(positions);
    const totalFeesRow = db.prepare("SELECT COALESCE(SUM(total_fees), 0) AS total_fees FROM transactions").get() as { total_fees?: number } | undefined;
    const totalFees = Number(totalFeesRow?.total_fees ?? 0);
    const totalPerformance = totalValue - totalCost;

    return {
      totalValue,
      totalCost,
      totalDividendsReceived,
      totalFees,
      totalPerformance,
      totalPerformancePercent: totalCost ? (totalPerformance / totalCost) * 100 : 0,
      positionsCount: positions.reduce((sum, position) => sum + position.quantity, 0),
      assetsCount: positions.length,
      currency: "EUR",
      positions
    };
  }

  async performance(range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<PortfolioPerformancePoint[]> {
    const positions = this.listPositions();
    if (!positions.length) return [];
    logger.debug("portfolio", "performance calculation", { range, positions: positions.length });

    const histories = await Promise.all(
      positions.map(async (position) => ({
        position,
        history: await this.safeHistory(position.symbol, range, options),
        fallbackPrice: await this.safeCurrentPrice(position)
      }))
    );
    const now = options.intradayNow?.getTime() ?? Date.now();
    const timeline = [...new Set(histories.flatMap((item) => item.history.map((point) => point.date)))]
      .filter((date) => new Date(date).getTime() <= now)
      .sort((a, b) => a.localeCompare(b));

    if (timeline.length < 2) {
      logger.warn("portfolio", "portfolio chart has too few points", {
        range,
        timelinePoints: timeline.length,
        assets: histories.map((item) => `${item.position.symbol}:${item.history.length}`).join(",")
      });
      const fallbackDate = new Date().toISOString();
      const fallbackValue = histories.reduce((sum, item) => {
        const quantity = this.hasDatedTransactions(item.position.id) ? this.getQuantityHeldAtDate(item.position.id, fallbackDate) : item.position.quantity;
        return sum + item.fallbackPrice * quantity;
      }, 0);
      const fallbackInvested = histories.reduce((sum, item) => {
        const quantity = this.hasDatedTransactions(item.position.id) ? this.getQuantityHeldAtDate(item.position.id, fallbackDate) : item.position.quantity;
        return sum + (this.hasDatedTransactions(item.position.id) ? this.getCostBasisHeldAtDate(item.position.id, fallbackDate) : item.position.averageBuyPrice * quantity);
      }, 0);
      const fallbackGain = fallbackValue - fallbackInvested;
      return [{ date: fallbackDate, value: fallbackValue, invested: fallbackInvested, gain: fallbackGain, gainPercent: fallbackInvested ? (fallbackGain / fallbackInvested) * 100 : 0, stale: true }];
    }

    const cursors = new Map<string, number>();
    const lastPrices = new Map<string, number>();
    for (const item of histories) {
      cursors.set(item.position.symbol, 0);
      lastPrices.set(item.position.symbol, item.fallbackPrice);
    }

    return timeline.map((date) => {
      let value = 0;
      let invested = 0;

      for (const item of histories) {
        const symbol = item.position.symbol;
        let cursor = cursors.get(symbol) ?? 0;
        while (cursor < item.history.length && new Date(item.history[cursor].date).getTime() <= new Date(date).getTime()) {
          lastPrices.set(symbol, item.history[cursor].close);
          cursor += 1;
        }
        cursors.set(symbol, cursor);
        const quantity = this.hasDatedTransactions(item.position.id) ? this.getQuantityHeldAtDate(item.position.id, date) : item.position.quantity;
        value += (lastPrices.get(symbol) ?? item.fallbackPrice) * quantity;
        invested += this.hasDatedTransactions(item.position.id)
          ? this.getCostBasisHeldAtDate(item.position.id, date)
          : item.position.averageBuyPrice * quantity;
      }

      const gain = value - invested;
      return { date, value, invested, gain, gainPercent: invested ? (gain / invested) * 100 : 0, stale: histories.some((item) => item.history.some((point) => point.stale)) };
    });
  }

  /**
   * Retourne le chart de portefeuille pré-calculé et mis en cache.
   *
   * @param range Range demandée par le frontend.
   * @param userId Identifiant utilisateur propriétaire du portefeuille.
   * @returns DTO chart compact avec valeur, investi, gain et gainPercent.
   */
  async chart(range: RangeKey, userId?: string | number, options: PortfolioMarketDataOptions = {}): Promise<PortfolioChartDto> {
    const cacheUserId = normalizedUserId(userId);
    const points = await this.performance(range, options);
    const positions = this.listPositions();
    const totalInvested = positions.reduce((sum, position) => sum + position.quantity * position.averageBuyPrice, 0);
    const timestamps: number[] = [];
    const value: number[] = [];
    const invested: number[] = [];
    const gain: number[] = [];
    const gainPercent: number[] = [];

    for (const point of points) {
      const timestamp = new Date(point.date).getTime();
      if (!Number.isFinite(timestamp) || !Number.isFinite(point.value)) continue;
      const investedAtPoint = point.invested ?? totalInvested;
      const gainAtPoint = point.gain ?? point.value - investedAtPoint;
      timestamps.push(timestamp);
      value.push(point.value);
      invested.push(investedAtPoint);
      gain.push(gainAtPoint);
      gainPercent.push(point.gainPercent ?? (investedAtPoint ? (gainAtPoint / investedAtPoint) * 100 : 0));
    }

    const first = value[0] ?? 0;
    const last = value[value.length - 1] ?? first;
    const firstGain = gain[0] ?? 0;
    const lastGain = gain[gain.length - 1] ?? firstGain;
    const firstInvested = invested[0] ?? 0;
    const lastInvested = invested[invested.length - 1] ?? firstInvested;
    const baseline = range === "1d" ? await this.portfolioIntradayBaseline(options) : undefined;
    const performanceStart = baseline?.price ?? first;
    const performanceEuro = range === "1d" && baseline ? last - performanceStart : lastGain - firstGain;
    const performanceBase = range === "1d" && baseline ? performanceStart : firstInvested || lastInvested;
    const cachedAt = nowMs();
    const preparation = await this.portfolioPreparationState(range, options);
    const payload: PortfolioChartDto = {
      userId: cacheUserId,
      range: toDisplayRange(range),
      timestamps,
      value,
      invested,
      gain,
      gainPercent,
      baselinePrice: baseline?.price,
      baselineDatetime: baseline?.datetime,
      marketSession: range === "1d" ? this.portfolioMarketSession(positions) : undefined,
      performanceEuro,
      performancePercent: performanceBase ? (performanceEuro / performanceBase) * 100 : 0,
      ...preparation,
      cachedAt,
      expiresAt: cachedAt,
      transactionMarkers: this.transactionMarkersForChart(range, timestamps)
    };
    return payload;
  }

  /**
   * Construit les marqueurs de transactions visibles sur le chart deja calcule.
   *
   * @param range Range affichee, intraday exclu.
   * @param timestamps Points X du chart de portefeuille.
   * @returns Markers enrichis et accroches au point de chart le plus proche.
   */
  private transactionMarkersForChart(range: RangeKey, timestamps: number[]): PortfolioTransactionMarker[] {
    if (!portfolioTransactionMarkerRanges.has(range) || timestamps.length === 0) return [];

    const sortedTimestamps = [...timestamps].filter(Number.isFinite).sort((a, b) => a - b);
    const firstTimestamp = sortedTimestamps[0];
    const lastTimestamp = sortedTimestamps[sortedTimestamps.length - 1];
    if (!Number.isFinite(firstTimestamp) || !Number.isFinite(lastTimestamp)) return [];

    const rows = db
      .prepare(
        `SELECT
           t.id,
           t.position_id,
           t.type,
           t.quantity,
           t.price,
           t.traded_at,
           p.symbol,
           p.name AS position_name,
           a.id AS asset_row_id,
           a.name AS asset_name
         FROM transactions t
         JOIN positions p ON p.id = t.position_id
         LEFT JOIN assets a ON a.symbol = p.symbol
         WHERE t.traded_at IS NOT NULL
           AND t.type IN ('buy', 'sell')
         ORDER BY t.traded_at ASC, t.id ASC`
      )
      .all() as Array<{
        id: number | string;
        position_id: number | string;
        type: "buy" | "sell";
        quantity: number | string;
        price: number | string | null;
        traded_at: string;
        symbol: string;
        position_name: string;
        asset_row_id?: number | string | null;
        asset_name?: string | null;
      }>;

    return rows.flatMap((row) => {
      const transactionTime = new Date(row.traded_at).getTime();
      if (!Number.isFinite(transactionTime) || !isTransactionVisibleInRange(row.traded_at, transactionTime, firstTimestamp, lastTimestamp, range)) return [];
      const symbol = String(row.symbol).toUpperCase();
      const price = row.price == null ? undefined : Number(row.price);
      return [{
        id: String(row.id),
        assetId: String(row.asset_row_id ?? row.position_id),
        symbol,
        name: String(row.asset_name ?? row.position_name ?? symbol),
        logoUrl: `/api/assets/${encodeURIComponent(symbol)}/icon`,
        quantity: Number(row.quantity),
        price: Number.isFinite(price) ? price : undefined,
        transactionDate: new Date(transactionTime).toISOString(),
        type: row.type,
        nearestChartPointDatetime: nearestTimestamp(transactionTime, sortedTimestamps)
      }];
    });
  }

  /**
   * Retourne une session intraday commune uniquement si toutes les positions
   * partagent exactement la meme timezone de marche et les memes horaires.
   */
  private portfolioMarketSession(positions: Position[]): MarketSessionDto | undefined {
    if (!positions.length) return undefined;
    const sessions = positions.map((position) => {
      const asset = assetRepository.findBySymbol(position.symbol);
      return getMarketSessionInfo(position.symbol, asset?.exchange);
    });
    const groups = new Map<string, { session: MarketSessionDto; count: number; cities: Set<string> }>();
    for (const session of sessions) {
      const key = `${session.timezone}|${session.open}|${session.close}`;
      const group = groups.get(key);
      if (group) {
        group.count += 1;
        group.cities.add(session.city);
      } else {
        groups.set(key, { session, count: 1, cities: new Set([session.city]) });
      }
    }

    const dominant = [...groups.values()].sort((a, b) => b.count - a.count)[0];
    if (!dominant) return undefined;
    return {
      ...dominant.session,
      city: dominant.cities.size === 1 ? dominant.session.city : dominant.session.timezone
    };
  }

  private async portfolioIntradayBaseline(options: PortfolioMarketDataOptions = {}): Promise<{ price: number; datetime?: string } | undefined> {
    const positions = this.listPositions();
    if (!positions.length) return undefined;

    let price = 0;
    const datetimes: string[] = [];
    for (const position of positions) {
      const chart = await marketDataService.getChartData(position.symbol, "1d", options).catch(() => undefined);
      if (!chart?.baselinePrice || !Number.isFinite(chart.baselinePrice)) continue;
      const quantity = chart.baselineDatetime && this.hasDatedTransactions(position.id)
        ? this.getQuantityHeldAtDate(position.id, chart.baselineDatetime)
        : position.quantity;
      price += chart.baselinePrice * quantity;
      if (chart.baselineDatetime) datetimes.push(chart.baselineDatetime);
    }

    if (!price) return undefined;
    return { price, datetime: datetimes.sort((a, b) => b.localeCompare(a))[0] };
  }

  private async portfolioPreparationState(range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<Pick<PortfolioChartDto, "isPreparing" | "missingAssets" | "missingRanges" | "jobId">> {
    const missingAssets: string[] = [];
    const jobIds: string[] = [];
    for (const position of this.listPositions()) {
      const chart = await marketDataService.getChartData(position.symbol, range, options);
      if (chart.isPreparing) {
        missingAssets.push(position.symbol);
        if (chart.jobId) jobIds.push(chart.jobId);
      }
    }
    return {
      isPreparing: missingAssets.length > 0,
      missingAssets,
      missingRanges: missingAssets.length > 0 ? [range] : undefined,
      jobId: jobIds[0]
    };
  }

  /**
   * Retourne la position calculée d'un utilisateur pour un symbole, avec cache sans TTL.
   *
   * @param userId Identifiant utilisateur.
   * @param symbol Symbole recherché.
   * @returns Position calculée ou undefined si aucune position n'existe.
   */
  userAssetPosition(userId: string | number, symbol: string): UserAssetPositionDto | undefined {
    const cacheUserId = normalizedUserId(userId);
    const key = symbol.toUpperCase();
    const cached = db.prepare("SELECT * FROM user_assets WHERE user_id = ? AND symbol = ?").get(cacheUserId, key) as
      | { user_id: string; symbol: string; quantity: number; average_price: number; transaction_count: number; total_fees: number; invested_amount: number }
      | undefined;
    if (cached) {
      return {
        userId: cached.user_id,
        symbol: cached.symbol,
        quantity: Number(cached.quantity),
        averagePrice: Number(cached.average_price),
        transactionCount: Number(cached.transaction_count),
        totalFees: Number(cached.total_fees),
        investedAmount: Number(cached.invested_amount)
      };
    }

    const position = db.prepare("SELECT id FROM positions WHERE symbol = ?").get(key) as { id: number } | undefined;
    if (!position) return undefined;
    return this.persistUserAssetPosition(cacheUserId, position.id);
  }

  async positionsPerformance(range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<PositionRangePerformance[]> {
    const positions = this.listPositions();
    logger.debug("portfolio", "positions performance calculation", { range, positions: positions.length });
    return Promise.all(positions.map((position) => this.positionRangePerformance(position, range, options)));
  }

  /**
   * Calcule la performance d'une seule position pour permettre le chargement paresseux.
   *
   * @param positionId Identifiant interne de la position.
   * @param range Range demandée par le frontend.
   * @returns Performance de position prête à afficher.
   */
  async singlePositionPerformance(positionId: number, range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<PositionRangePerformance> {
    const row = db.prepare("SELECT * FROM positions WHERE id = ?").get(positionId) as any;
    if (!row) throw new HttpError(404, "Position introuvable");
    logger.debug("portfolio", "single position performance calculation", { range, positionId });
    return this.positionRangePerformance(mapPosition(row), range, options);
  }

  /**
   * Récupère les quotes des positions détenues en batch, sans inclure la watchlist.
   *
   * @param positions Positions réellement détenues par l'utilisateur.
   * @returns Map des quotes par symbole.
   */
  private async quotesForPositions(positions: Position[]) {
    if (!positions.length) return new Map<string, Quote>();
    try {
      const quotes = await Promise.all(positions.map((position) => marketSnapshotService.getQuote(position.symbol)));
      logger.debug("portfolio", "portfolio quotes batch resolved", {
        symbols: positions.map((position) => position.symbol).join(","),
        requested: positions.length,
        returned: quotes.length
      });
      return new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote]));
    } catch (error) {
      if (!isMarketDataUnavailable(error)) throw error;
      logger.warn("portfolio", "portfolio quotes batch unavailable", {
        symbols: positions.map((position) => position.symbol).join(","),
        error: error instanceof Error ? error.message : String(error)
      });
      return new Map<string, Quote>();
    }
  }

  private async enrichPosition(position: Position): Promise<PositionWithMarket> {
    let quote;
    try {
      quote = await marketSnapshotService.getQuote(position.symbol);
    } catch (error) {
      if (!isMarketDataUnavailable(error)) {
        throw error;
      }
    }

    return this.enrichPositionWithQuote(position, quote);
  }

  private totalDividendsReceived(positions: PositionWithMarket[]): number {
    const now = Date.now();
    return positions.reduce((portfolioTotal, position) => {
      const dividends = dividendsService.readDividends(position.symbol);
      const positionTotal = dividends.reduce((sum, event) => {
        const eventTime = new Date(event.date).getTime();
        if (!Number.isFinite(eventTime) || eventTime > now) return sum;
        const quantity = this.hasDatedTransactions(position.id)
          ? this.getQuantityHeldAtDate(position.id, event.date)
          : position.quantity;
        return sum + event.amount * quantity;
      }, 0);
      return portfolioTotal + positionTotal;
    }, 0);
  }

  /**
   * Enrichit une position avec une quote déjà récupérée, sans nouvel appel Yahoo.
   *
   * @param position Position enregistrée en base.
   * @param quote Quote optionnelle issue du batch.
   * @returns Position enrichie avec prix, valeur et performance.
   */
  private enrichPositionWithQuote(position: Position, quote?: Quote): PositionWithMarket {
    const dated = this.hasDatedTransactions(position.id);
    const effectivePosition = dated ? this.positionFromDatedTransactions(position) : position;
    const currentPrice = quote?.price || effectivePosition.averageBuyPrice;
    const marketValue = currentPrice * effectivePosition.quantity;
    const costBasis = effectivePosition.averageBuyPrice * effectivePosition.quantity;
    const performance = marketValue - costBasis;

    return {
      ...effectivePosition,
      name: effectivePosition.name || quote?.name || effectivePosition.symbol,
      quote,
      currentPrice,
      marketValue,
      costBasis,
      performance,
      performancePercent: costBasis ? (performance / costBasis) * 100 : 0,
      estimatedAnnualDividend: quote?.dividendRate ? quote.dividendRate * position.quantity : undefined,
      marketDataUnavailable: !quote || quote.unavailable
    };
  }

  private positionFromDatedTransactions(position: Position): Position {
    const rows = db
      .prepare("SELECT type, quantity, price, total_fees FROM transactions WHERE position_id = ? ORDER BY traded_at ASC, id ASC")
      .all(position.id) as Array<{ type: string; quantity: number; price: number; total_fees?: number }>;
    if (!rows.length) return position;

    let quantity = 0;
    let costBasis = 0;
    for (const row of rows) {
      const rowQuantity = Number(row.quantity);
      if (row.type === "buy") {
        const buyCost = rowQuantity * Number(row.price) + Number(row.total_fees ?? 0);
        quantity += rowQuantity;
        costBasis += buyCost;
      } else if (row.type === "sell") {
        const averageCost = quantity > 0 ? costBasis / quantity : 0;
        quantity -= rowQuantity;
        costBasis = Math.max(0, costBasis - averageCost * rowQuantity);
      }
    }

    return {
      ...position,
      quantity,
      averageBuyPrice: quantity > 0 ? costBasis / quantity : 0
    };
  }

  private async safeHistory(symbol: string, range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<HistoryPoint[]> {
    try {
      const chart = await marketDataService.getChartData(symbol, range, options);
      return chart.timestamps.map((timestamp, index) => ({
        date: new Date(timestamp).toISOString(),
        close: chart.prices[index]
      }));
    } catch (error) {
      if (isMarketDataUnavailable(error)) return [];
      throw error;
    }
  }

  private async safeCurrentPrice(position: Position) {
    try {
      const quote = await marketSnapshotService.getQuote(position.symbol);
      return quote.price || position.averageBuyPrice;
    } catch (error) {
      if (isMarketDataUnavailable(error)) return position.averageBuyPrice;
      throw error;
    }
  }

  private async positionRangePerformance(position: Position, range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<PositionRangePerformance> {
    const effectivePosition = this.hasDatedTransactions(position.id) ? this.positionFromDatedTransactions(position) : position;
    const [history, quoteResult] = await Promise.all([
      this.safeHistory(effectivePosition.symbol, range, options),
      this.safeQuote(effectivePosition)
    ]);
    const quote = quoteResult.quote;
    const validHistory = history.filter((point) => Number.isFinite(point.close)).sort((a, b) => a.date.localeCompare(b.date));
    const firstPoint = validHistory[0];
    const lastPoint = validHistory[validHistory.length - 1];
    const fallbackCurrentPrice = quote?.price || effectivePosition.averageBuyPrice;
    const currentPrice = lastPoint?.close || fallbackCurrentPrice;
    const intervalStartPrice =
      firstPoint?.close ||
      (range === "1d" && quote?.previousClose ? quote.previousClose : undefined) ||
      currentPrice ||
      effectivePosition.averageBuyPrice;

    const currentMarketValue = effectivePosition.quantity * currentPrice;
    const intervalQuantity = this.hasDatedTransactions(effectivePosition.id) && firstPoint ? this.getQuantityHeldAtDate(effectivePosition.id, firstPoint.date) : effectivePosition.quantity;
    const totalCost = effectivePosition.quantity * effectivePosition.averageBuyPrice;
    const intervalStartMarketValue = intervalQuantity * intervalStartPrice;
    const intervalStartCost = this.hasDatedTransactions(effectivePosition.id) && firstPoint
      ? this.getCostBasisHeldAtDate(effectivePosition.id, firstPoint.date)
      : effectivePosition.averageBuyPrice * intervalQuantity;
    const intervalStartGain = intervalStartMarketValue - intervalStartCost;
    const currentGain = currentMarketValue - totalCost;
    const intervalPerformanceValue = currentGain - intervalStartGain;
    const intervalPerformanceBase = intervalStartCost || totalCost;
    const intervalPerformancePercent = intervalPerformanceBase ? (intervalPerformanceValue / intervalPerformanceBase) * 100 : 0;
    const totalPerformanceValue = currentMarketValue - totalCost;
    const totalPerformancePercent = totalCost ? (totalPerformanceValue / totalCost) * 100 : 0;
    const incompleteData = !firstPoint || !lastPoint || quoteResult.stale || history.some((point) => point.stale);

    return {
      ...effectivePosition,
      currentPrice,
      currentMarketValue,
      intervalStartPrice,
      intervalStartMarketValue,
      intervalPerformanceValue,
      intervalPerformancePercent,
      totalPerformanceValue,
      totalPerformancePercent,
      stale: incompleteData,
      incompleteData
    };
  }

  private async safeQuote(position: Position) {
    try {
      const quote = await marketSnapshotService.getQuote(position.symbol);
      return { quote, stale: Boolean(quote.stale || quote.unavailable) };
    } catch (error) {
      if (isMarketDataUnavailable(error)) return { quote: undefined, stale: true };
      throw error;
    }
  }

  /**
   * Persiste la position calculée après lecture des transactions.
   *
   * @param userId Identifiant utilisateur propriétaire.
   * @param positionId Identifiant interne de la position.
   * @returns DTO position utilisateur.
   */
  private persistUserAssetPosition(userId: string, positionId: number): UserAssetPositionDto | undefined {
    const position = db.prepare("SELECT * FROM positions WHERE id = ?").get(positionId) as any;
    if (!position) return undefined;
    const transactions = db.prepare("SELECT type, quantity, price, total_fees FROM transactions WHERE position_id = ?").all(positionId) as Array<{
      type: string;
      quantity: number;
      price: number;
      total_fees?: number;
    }>;
    const transactionCount = transactions.length;
    const totalFees = transactions.reduce((sum, row) => sum + Number(row.total_fees ?? 0), 0);
    const investedAmount = Number(position.quantity) * Number(position.average_buy_price);
    const payload: UserAssetPositionDto = {
      userId,
      symbol: String(position.symbol).toUpperCase(),
      quantity: Number(position.quantity),
      averagePrice: Number(position.average_buy_price),
      transactionCount,
      totalFees,
      investedAmount
    };
    db.prepare(
      `INSERT INTO user_assets (user_id, symbol, quantity, average_price, transaction_count, total_fees, invested_amount, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, symbol) DO UPDATE SET quantity = excluded.quantity, average_price = excluded.average_price, transaction_count = excluded.transaction_count, total_fees = excluded.total_fees, invested_amount = excluded.invested_amount, updated_at = excluded.updated_at`
    ).run(payload.userId, payload.symbol, payload.quantity, payload.averagePrice, payload.transactionCount, payload.totalFees, payload.investedAmount, nowMs());
    return payload;
  }

  /**
   * Invalide les caches utilisateur liés à une position modifiée.
   *
   * @param positionId Identifiant interne de la position.
   * @param fallbackSymbol Symbole connu lorsque la ligne n'est pas encore relue.
   * @returns Rien.
   */
  private invalidatePositionCaches(positionId: number, fallbackSymbol?: string) {
    const row = db.prepare("SELECT symbol FROM positions WHERE id = ?").get(positionId) as { symbol?: string } | undefined;
    invalidateUserAssetCaches("*", row?.symbol ?? fallbackSymbol);
  }

  /**
   * Calcule la fraîcheur du chart portefeuille pour intraday et 1W.
   *
   * @returns Décision de refresh selon ouverture de marché et dernière clôture des actifs.
   */
}

export const portfolioService = new PortfolioService();
