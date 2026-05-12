/**
 * Rôle du fichier : gérer les positions, transactions et agrégations de portefeuille.
 * Le service calcule les DTO prêts à afficher et invalide les caches utilisateur.
 */

import type { CreatePositionInput, EditablePortfolioTransaction, HistoryPoint, MarketSessionDto, PortfolioChartDto, PortfolioFullDto, PortfolioPerformancePoint, PortfolioSummary, PortfolioTransactionMarker, Position, PositionMiniChart, PositionRangePerformance, PositionTransactionStats, PositionWithMarket, Quote, RangeKey, UpdatePositionInput, UserAssetPositionDto } from "@pea/shared";
import { z } from "zod";
import { db } from "../../db.js";
import { HttpError } from "../../utils/http-error.js";
import { currentUserId, normalizeUserId } from "../auth/user-context.js";
import { config } from "../../config.js";
import { assetRepository } from "../../repositories/market/asset.repository.js";
import { chartConfigService } from "../market/charts/chart-config.service.js";
import { dataConstructionQueue } from "../market/construction/data-construction-queue.service.js";
import { getMarketSessionInfo } from "../market/calendars/marketCalendar.service.js";
import { marketDataService } from "../market/data/market-data.service.js";
import { marketSnapshotService } from "../market/snapshots/market-snapshot.service.js";
import { invalidateUserAssetCaches, nowMs, toDisplayRange } from "../shared/cache.service.js";
import { frontendBlockCache } from "../shared/frontend-block-cache.service.js";
import { logger } from "../shared/logger.service.js";
import { isMarketDataUnavailable } from "../yahoo/index.js";
import { isTransactionVisibleInRange, nearestTimestamp } from "./portfolio.helpers.js";
import { buildTransactionCache, computeTotalDividendsReceived, downsamplePoints, getCostBasisAtTime, getQuantityAtTime, positionFromTransactionCache, type PositionTransactionCache } from "./portfolio-calculations.js";
import { portfolioPerformanceCache } from "./portfolio-performance-cache.service.js";
import { mapPosition, portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { calculateTransactionStats, legacyTransactionFromPosition } from "./portfolioTransactions.service.js";

const createPositionSchema = z.object({
  symbol: z.string().trim().min(1).max(24),
  name: z.string().trim().optional(),
  quantity: z.number().positive(),
  averageBuyPrice: z.number().nonnegative(),
  currency: z.string().trim().min(3).max(8).default("EUR"),
  notes: z.string().trim().optional()
});

const portfolioTransactionMarkerRanges = new Set<RangeKey>(["1w", "1m", "ytd", "1y", "5y", "10y", "all"]);
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
 * Calcule un identifiant utilisateur stable pour les caches historiques mono-utilisateur.
 *
 * @param userId Identifiant utilisateur éventuel fourni par l'authentification.
 * @returns Identifiant texte compatible avec les clés de cache.
 */
function normalizedUserId(userId?: string | number) {
  return String(normalizeUserId(userId));
}

function finiteMarketNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function downsampleMiniChartPoints(points: PositionMiniChart["points"], maxPoints = 40): PositionMiniChart["points"] {
  if (points.length <= maxPoints) return points;
  const result: PositionMiniChart["points"] = [];
  const last = points.length - 1;
  for (let index = 0; index < maxPoints; index += 1) {
    const point = points[Math.round((index * last) / (maxPoints - 1))];
    if (point) result.push(point);
  }
  return result;
}

function downsampleHistoryForMiniChart(points: HistoryPoint[], maxPoints = 40): HistoryPoint[] {
  if (points.length <= maxPoints) return points;
  const result: HistoryPoint[] = [];
  const last = points.length - 1;
  for (let index = 0; index < maxPoints; index += 1) {
    const point = points[Math.round((index * last) / (maxPoints - 1))];
    if (point) result.push(point);
  }
  return result;
}

export class PortfolioService {
  listPositions(): Position[] {
    const rows = portfolioRepository.listPositions();
    return rows.map(mapPosition);
  }

  async getPosition(symbol: string): Promise<PositionWithMarket | undefined> {
    const row = portfolioRepository.findPositionBySymbol(symbol);
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
    const existing = portfolioRepository.findPositionBySymbol(parsed.symbol);

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
         WHERE user_id = ? AND symbol = ?`
      ).run(newQuantity, weightedAverage, name, parsed.currency, currentUserId(), parsed.symbol);
    } else {
      portfolioRepository.insertPosition({ symbol: parsed.symbol, name, quantity: parsed.quantity, averageBuyPrice: parsed.averageBuyPrice, currency: parsed.currency });
    }

    const position = portfolioRepository.findPositionBySymbol(parsed.symbol)!;
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
    const existing = portfolioRepository.findPositionBySymbol(normalizedSymbol);
    if (existing) return mapPosition(existing);
    db.prepare(
      `INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency)
       VALUES (?, ?, ?, 0, 0, ?)`
    ).run(currentUserId(), normalizedSymbol, name, currency);
    const created = portfolioRepository.findPositionBySymbol(normalizedSymbol)!;
    return mapPosition(created);
  }

  /**
   * Indique si une position possède au moins une transaction avec date d'exécution.
   * Utilisée par les routes externes (assets, dividends) pour décider si le calcul
   * de quantité doit prendre en compte l'historique transactionnel ou la quantité fixe.
   */
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
    const ownedPosition = portfolioRepository.findPositionById(positionId);
    if (!ownedPosition) return [];
    const rows = portfolioRepository.listTransactions(positionId);
    if (!rows.length) {
      return [legacyTransactionFromPosition(mapPosition(ownedPosition))];
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
      type: row.type === "sell" ? "sell" : "buy",
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
    const position = portfolioRepository.findPositionById(positionId);
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
    if (!portfolioRepository.findPositionById(positionId)) throw new HttpError(404, "Position introuvable");
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
    if (!portfolioRepository.findPositionById(positionId)) throw new HttpError(404, "Position introuvable");
    db.prepare("DELETE FROM transactions WHERE id = ? AND position_id = ?").run(transactionId, positionId);
    this.recomputePositionFromAnyTransactions(positionId);
    this.invalidatePositionCaches(positionId);
  }

  recomputePositionFromAnyTransactions(positionId: number) {
    const rows = portfolioRepository.listTransactionSequence(positionId);
    if (!rows.length) {
      db.prepare("UPDATE positions SET quantity = 0, average_buy_price = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(positionId);
      this.persistUserAssetPosition(currentUserId().toString(), positionId);
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
    this.persistUserAssetPosition(currentUserId().toString(), positionId);
  }

  assertValidTransactionMutation(positionId: number, input: TransactionMutationInput, transactionIdToReplace?: number) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new HttpError(400, "La quantite doit etre strictement positive.");
    }
    if (!Number.isFinite(input.price) || input.price < 0) {
      throw new HttpError(400, "Le prix doit etre positif ou nul.");
    }

    const rows = portfolioRepository.listTransactionSequence(positionId) as TransactionSequenceRow[];
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
      const timeA = new Date(a.traded_at).getTime();
      const timeB = new Date(b.traded_at).getTime();
      const dateOrder = (Number.isFinite(timeA) ? timeA : 0) - (Number.isFinite(timeB) ? timeB : 0);
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
    const existing = portfolioRepository.findPositionById(id);
    if (!existing) return false;
    this.invalidatePositionCaches(id);
    portfolioRepository.deletePosition(id);
    return true;
  }

  async updatePosition(id: number, input: UpdatePositionInput): Promise<PositionWithMarket> {
    const parsed = createPositionSchema
      .omit({ symbol: true, name: true })
      .parse(input);
    const existing = portfolioRepository.findPositionById(id);
    if (!existing) throw new HttpError(404, "Position introuvable");

    db.prepare(
      `UPDATE positions
       SET quantity = ?, average_buy_price = ?, currency = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(parsed.quantity, parsed.averageBuyPrice, parsed.currency, parsed.notes ?? null, id);
    this.invalidatePositionCaches(id);

    const row = portfolioRepository.findPositionById(id)!;
    return this.enrichPosition(mapPosition(row));
  }

  /**
   * Retourne en un seul appel le summary et le chart du portefeuille.
   * Évite deux allers-retours réseau distincts depuis le dashboard.
   *
   * @param range Range demandée par le frontend.
   * @param userId Identifiant utilisateur pour le cache chart.
   * @param options Options de marché (debug clock).
   */
  async full(range: RangeKey, userId?: string | number, options: PortfolioMarketDataOptions = {}): Promise<PortfolioFullDto> {
    const [summary, chart] = await Promise.all([
      this.summary(range),
      this.chart(range, userId, options)
    ]);
    return { summary, chart };
  }

  async summary(_range: RangeKey = "1d"): Promise<PortfolioSummary> {
    const cacheUserId = currentUserId().toString();
    if (config.enableMarketLiveRefresh) {
      const cached = frontendBlockCache.read<PortfolioSummary>(cacheUserId, "portfolio-summary", _range);
      if (cached) return cached;
    }
    const basePositions = this.listPositions();
    const quotesBySymbol = await this.quotesForPositions(basePositions);
    // Pré-charge toutes les transactions pour éviter N requêtes hasDatedTransactions dans enrichPositionWithQuote
    const txCache = buildTransactionCache(basePositions.map((p) => p.id));
    const positions = basePositions.map((position) => this.enrichPositionWithQuote(position, quotesBySymbol.get(position.symbol.toUpperCase()), txCache));
    const totalValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
    const totalCost = positions.reduce((sum, position) => sum + position.costBasis, 0);
    const totalDividendsReceived = this.totalDividendsReceived(positions, txCache);
    const totalFeesRow = db
      .prepare(
        `SELECT COALESCE(SUM(t.total_fees), 0) AS total_fees
         FROM transactions t
         JOIN positions p ON p.id = t.position_id
         WHERE p.user_id = ?`
      )
      .get(currentUserId()) as { total_fees?: number } | undefined;
    const totalFees = Number(totalFeesRow?.total_fees ?? 0);
    const totalPerformance = totalValue - totalCost;

    const payload = {
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
    if (config.enableMarketLiveRefresh) frontendBlockCache.write(cacheUserId, "portfolio-summary", payload, chartConfigService.getSnapshotRefreshIntervalMs(), _range);
    return payload;
  }

  async performance(range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<PortfolioPerformancePoint[]> {
    const positions = this.listPositions();
    if (!positions.length) return [];
    logger.debug("portfolio", "performance calculation", { range, positions: positions.length });

    // Pré-charge toutes les transactions datées en une seule requête SQL avant la boucle.
    // Sans ce cache, chaque point de la timeline × chaque position déclenchait 3 requêtes DB,
    // soit jusqu'à 7 500+ requêtes pour 10 positions / 1 an de données quotidiennes.
    const txCache = buildTransactionCache(positions.map((p) => p.id));

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
      const fallbackTimeMs = new Date(fallbackDate).getTime();
      const fallbackValue = histories.reduce((sum, item) => {
        const entry = txCache.get(item.position.id);
        const quantity = entry?.hasDated ? getQuantityAtTime(entry.transactions, fallbackTimeMs) : item.position.quantity;
        return sum + item.fallbackPrice * quantity;
      }, 0);
      const fallbackInvested = histories.reduce((sum, item) => {
        const entry = txCache.get(item.position.id);
        if (entry?.hasDated) {
          return sum + getCostBasisAtTime(entry.transactions, fallbackTimeMs);
        }
        return sum + item.position.averageBuyPrice * item.position.quantity;
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

    // Pré-calcule les timestamps entiers des points de timeline pour éviter
    // de recréer des objets Date à chaque tour de la double boucle positions × dates.
    const timelineMs = timeline.map((date) => new Date(date).getTime());

    const rawPoints = timeline.map((date, timelineIndex) => {
      let value = 0;
      let invested = 0;
      const dateMs = timelineMs[timelineIndex];

      for (const item of histories) {
        const symbol = item.position.symbol;
        let cursor = cursors.get(symbol) ?? 0;
        while (cursor < item.history.length && new Date(item.history[cursor].date).getTime() <= dateMs) {
          lastPrices.set(symbol, item.history[cursor].close);
          cursor += 1;
        }
        cursors.set(symbol, cursor);

        // Utilise le cache en mémoire : zéro requête DB dans cette boucle
        const entry = txCache.get(item.position.id);
        const quantity = entry?.hasDated ? getQuantityAtTime(entry.transactions, dateMs) : item.position.quantity;
        value += (lastPrices.get(symbol) ?? item.fallbackPrice) * quantity;
        invested += entry?.hasDated
          ? getCostBasisAtTime(entry.transactions, dateMs)
          : item.position.averageBuyPrice * quantity;
      }

      const gain = value - invested;
      return { date, value, invested, gain, gainPercent: invested ? (gain / invested) * 100 : 0, stale: histories.some((item) => item.history.some((point) => point.stale)) };
    });

    // Réduit le nombre de points pour les grandes plages (5y/10y/all) afin d'alléger
    // la sérialisation JSON et le rendu recharts côté frontend.
    const maxPointsByRange: Partial<Record<RangeKey, number>> = { "5y": 520, "10y": 520, all: 520 };
    const maxPoints = maxPointsByRange[range];
    return maxPoints !== undefined ? downsamplePoints(rawPoints, maxPoints) : rawPoints;
  }

  /** TTL du cache chart en ms selon la range : l'intraday change constamment, les autres rarement. */
  private static readonly CHART_CACHE_TTL_MS: Partial<Record<RangeKey, number>> = {
    "1d": 5 * 60 * 1000,
    "1w": 60 * 60 * 1000,
    "1m": 4 * 60 * 60 * 1000,
    "ytd": 4 * 60 * 60 * 1000,
    "1y": 4 * 60 * 60 * 1000,
    "5y": 12 * 60 * 60 * 1000,
    "10y": 12 * 60 * 60 * 1000,
    "all": 12 * 60 * 60 * 1000
  };

  /**
   * Retourne le chart de portefeuille pré-calculé et mis en cache en base SQLite.
   * Le cache est invalidé par invalidateUserAssetCaches() lors d'une mutation de position.
   * En cas de données manquantes (isPreparing), le résultat n'est pas mis en cache
   * pour forcer un recalcul dès que les données sont disponibles.
   *
   * @param range Range demandée par le frontend.
   * @param userId Identifiant utilisateur propriétaire du portefeuille.
   * @returns DTO chart compact avec valeur, investi, gain et gainPercent.
   */
  async chart(range: RangeKey, userId?: string | number, options: PortfolioMarketDataOptions = {}): Promise<PortfolioChartDto> {
    const cacheUserId = normalizedUserId(userId);

    // Lecture du cache persistant — évite le recalcul de performance() (~2-8s)
    if (!options.forceIntradayOpen && !options.intradayNow) {
      const cacheKey = `${cacheUserId}:${range}`;
      const cached = db.prepare(
        "SELECT payload, expires_at FROM portfolio_chart_cache WHERE cache_key = ? AND expires_at > ?"
      ).get(cacheKey, nowMs()) as { payload: string; expires_at: number } | undefined;
      if (cached) {
        return JSON.parse(cached.payload) as PortfolioChartDto;
      }
    }

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

    // Persiste le résultat sauf si des données sont encore en cours de préparation.
    // La clé inclut userId + range pour isoler les utilisateurs et les plages.
    if (!payload.isPreparing && !options.forceIntradayOpen && !options.intradayNow) {
      const ttl = PortfolioService.CHART_CACHE_TTL_MS[range] ?? 4 * 60 * 60 * 1000;
      const expiresAt = cachedAt + ttl;
      const cacheKey = `${cacheUserId}:${range}`;
      db.prepare(
        `INSERT INTO portfolio_chart_cache (cache_key, user_id, range, payload, cached_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at, expires_at = excluded.expires_at`
      ).run(cacheKey, cacheUserId, range, JSON.stringify({ ...payload, expiresAt }), cachedAt, expiresAt);
    }

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
           AND p.user_id = ?
         ORDER BY t.traded_at ASC, t.id ASC`
      )
      .all(currentUserId()) as Array<{
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

  /**
   * Calcule le prix de référence de début de journée pour le graphique intraday.
   * Le cache de transactions évite les requêtes répétées pour les positions datées.
   */
  private async portfolioIntradayBaseline(options: PortfolioMarketDataOptions = {}): Promise<{ price: number; datetime?: string } | undefined> {
    const positions = this.listPositions();
    if (!positions.length) return undefined;

    const txCache = buildTransactionCache(positions.map((p) => p.id));
    let price = 0;
    const datetimes: string[] = [];
    for (const position of positions) {
      const chart = await marketDataService.getChartData(position.symbol, "1d", options).catch(() => undefined);
      if (!chart?.baselinePrice || !Number.isFinite(chart.baselinePrice)) continue;
      let quantity: number;
      const entry = txCache.get(position.id);
      if (chart.baselineDatetime && entry?.hasDated) {
        quantity = getQuantityAtTime(entry.transactions, new Date(chart.baselineDatetime).getTime());
      } else {
        quantity = position.quantity;
      }
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

    const position = portfolioRepository.findPositionBySymbol(key, cacheUserId);
    if (!position) return undefined;
    return this.persistUserAssetPosition(cacheUserId, position.id);
  }

  async positionsPerformance(range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<PositionRangePerformance[]> {
    if (!options.forceIntradayOpen && !options.intradayNow) {
      return portfolioPerformanceCache.getOrCompute({
        userId: currentUserId().toString(),
        range,
        compute: () => this.calculatePositionsPerformance(range, options)
      });
    }
    return this.calculatePositionsPerformance(range, options);
  }

  private async calculatePositionsPerformance(range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<PositionRangePerformance[]> {
    const positions = this.listPositions();
    logger.debug("portfolio", "positions performance calculation", { range, positions: positions.length });
    // Pré-charge toutes les transactions en une seule requête et partage le cache
    // entre toutes les positions pour éviter N requêtes individuelles.
    const txCache = buildTransactionCache(positions.map((p) => p.id));
    return Promise.all(positions.map((position) => this.positionRangePerformance(position, range, options, txCache)));
  }

  /**
   * Calcule la performance d'une seule position pour permettre le chargement paresseux.
   *
   * @param positionId Identifiant interne de la position.
   * @param range Range demandée par le frontend.
   * @returns Performance de position prête à afficher.
   */
  async singlePositionPerformance(positionId: number, range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<PositionRangePerformance> {
    const row = portfolioRepository.findPositionById(positionId);
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

  /**
   * Calcule le total des dividendes reçus pour toutes les positions.
   * Le paramètre txCache évite de relancer des requêtes DB pour les quantités datées :
   * on réutilise le cache déjà chargé en amont (dans summary() ou performance()).
   */
  private totalDividendsReceived(positions: PositionWithMarket[], txCache: Map<number, import("./portfolio-calculations.js").PositionTransactionCache>): number {
    return computeTotalDividendsReceived(positions, txCache);
  }

  /**
   * Enrichit une position avec une quote déjà récupérée, sans nouvel appel Yahoo.
   * Le cache de transactions optionnel évite l'appel DB hasDatedTransactions() quand
   * on enrichit plusieurs positions en boucle (summary, enrichPosition).
   *
   * @param position Position enregistrée en base.
   * @param quote Quote optionnelle issue du batch.
   * @param txCache Cache optionnel pré-chargé par buildTransactionCache.
   * @returns Position enrichie avec prix, valeur et performance.
   */
  private enrichPositionWithQuote(position: Position, quote?: Quote, txCache?: Map<number, PositionTransactionCache>): PositionWithMarket {
    // Si aucun cache global n'est fourni, on en construit un pour cette seule position
    const resolvedCache = txCache ?? buildTransactionCache([position.id]);
    const entry = resolvedCache.get(position.id);
    const dated = entry?.hasDated ?? false;
    const effectivePosition = dated ? positionFromTransactionCache(position, entry!.transactions) : position;
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

  /**
   * Calcule la performance sur une plage pour une seule position.
   * Un cache de transactions optionnel peut être fourni pour éviter les requêtes
   * redondantes quand plusieurs positions sont traitées en série (positionsPerformance).
   */
  private async positionRangePerformance(
    position: Position,
    range: RangeKey,
    options: PortfolioMarketDataOptions = {},
    txCache?: Map<number, import("./portfolio-calculations.js").PositionTransactionCache>
  ): Promise<PositionRangePerformance> {
    // Charge le cache pour cette seule position si aucun cache global n'est fourni
    const cache = txCache ?? buildTransactionCache([position.id]);
    const entry = cache.get(position.id);
    const effectivePosition = entry?.hasDated ? positionFromTransactionCache(position, entry.transactions) : position;

    const [history, quoteResult] = await Promise.all([
      this.safeHistory(effectivePosition.symbol, range, options),
      this.safeQuote(effectivePosition)
    ]);
    const quote = quoteResult.quote;
    const validHistory = history.filter((point) => Number.isFinite(point.close)).sort((a, b) => a.date.localeCompare(b.date));
    const firstPoint = validHistory[0];
    const lastPoint = validHistory[validHistory.length - 1];
    const fallbackCurrentPrice = quote?.price || effectivePosition.averageBuyPrice;
    const snapshotPrice = range === "1d" ? finiteMarketNumber(quote?.price) : undefined;
    const snapshotChange = range === "1d" ? finiteMarketNumber(quote?.change) : undefined;
    const snapshotChangePercent = range === "1d" ? finiteMarketNumber(quote?.changePercent) : undefined;
    const currentPrice = snapshotPrice || lastPoint?.close || fallbackCurrentPrice;
    const intervalStartPrice =
      (range === "1d" && quote?.previousClose ? quote.previousClose : undefined) ||
      firstPoint?.close ||
      currentPrice ||
      effectivePosition.averageBuyPrice;

    const currentMarketValue = effectivePosition.quantity * currentPrice;
    const firstPointTimeMs = firstPoint ? new Date(firstPoint.date).getTime() : undefined;
    const intervalQuantity = entry?.hasDated && firstPointTimeMs !== undefined
      ? getQuantityAtTime(entry.transactions, firstPointTimeMs)
      : effectivePosition.quantity;
    const totalCost = effectivePosition.quantity * effectivePosition.averageBuyPrice;
    const intervalStartMarketValue = intervalQuantity * intervalStartPrice;
    const intervalStartCost = entry?.hasDated && firstPointTimeMs !== undefined
      ? getCostBasisAtTime(entry.transactions, firstPointTimeMs)
      : effectivePosition.averageBuyPrice * intervalQuantity;
    const intervalStartGain = intervalStartMarketValue - intervalStartCost;
    const currentGain = currentMarketValue - totalCost;
    const intervalPerformanceValue = snapshotChange !== undefined
      ? snapshotChange * effectivePosition.quantity
      : currentGain - intervalStartGain;
    const intervalPerformanceBase = intervalStartMarketValue || intervalStartCost || totalCost;
    const intervalPerformancePercent = snapshotChangePercent ?? (intervalPerformanceBase ? (intervalPerformanceValue / intervalPerformanceBase) * 100 : 0);
    const totalPerformanceValue = currentMarketValue - totalCost;
    const totalPerformancePercent = totalCost ? (totalPerformanceValue / totalCost) * 100 : 0;
    const hasSnapshotPerformance = snapshotPrice !== undefined && (snapshotChange !== undefined || quote?.previousClose !== undefined);
    const incompleteData = !hasSnapshotPerformance && (!firstPoint || !lastPoint || quoteResult.stale || history.some((point) => point.stale));
    const miniChart = this.positionMiniChart({
      position: effectivePosition,
      range,
      history: validHistory,
      txEntry: entry,
      stale: incompleteData
    });

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
      incompleteData,
      miniChart
    };
  }

  private positionMiniChart(input: {
    position: Position;
    range: RangeKey;
    history: HistoryPoint[];
    txEntry?: PositionTransactionCache;
    stale: boolean;
  }): PositionMiniChart {
    const sampledHistory = downsampleHistoryForMiniChart(input.history, 40);
    const rawPoints = sampledHistory
      .map((point) => {
        const timestamp = new Date(point.date).getTime();
        const close = Number(point.close);
        if (!Number.isFinite(timestamp) || !Number.isFinite(close)) return undefined;
        const quantity = input.txEntry?.hasDated
          ? getQuantityAtTime(input.txEntry.transactions, timestamp)
          : input.position.quantity;
        return { t: timestamp, v: close * quantity };
      })
      .filter((point): point is { t: number; v: number } => point !== undefined && Number.isFinite(point.v));

    return {
      range: input.range,
      points: downsampleMiniChartPoints(rawPoints, 40),
      marketSession: input.range === "1d" ? getMarketSessionInfo(input.position.symbol) : undefined,
      stale: input.stale || input.history.some((point) => point.stale),
      updatedAt: new Date().toISOString()
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
    const position = portfolioRepository.findPositionById(positionId, userId);
    if (!position) return undefined;
    const transactions = portfolioRepository.listTransactionSequence(positionId);
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
    const row = portfolioRepository.findPositionById(positionId);
    invalidateUserAssetCaches(currentUserId().toString(), row?.symbol ?? fallbackSymbol);
  }

  /**
   * Calcule la fraîcheur du chart portefeuille pour intraday et 1W.
   *
   * @returns Décision de refresh selon ouverture de marché et dernière clôture des actifs.
   */
}

export const portfolioService = new PortfolioService();
