import type { CreatePositionInput, Position, PositionWithMarket, UpdatePositionInput } from "@pea/shared";
import { z } from "zod";
import { db } from "../../db.js";
import { mapPosition, portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { currentUserId, requireUserId } from "../auth/user-context.js";
import { dataConstructionQueue } from "../market/construction/data-construction-queue.service.js";
import { marketDataService } from "../market/data/market-data.service.js";
import { marketSnapshotService } from "../market/snapshots/market-snapshot.service.js";
import { objectiveProjectionInvalidationService } from "../objectives/objective-projection-invalidation.service.js";
import { invalidateUserAssetCaches } from "../shared/cache.service.js";
import { isMarketDataUnavailable } from "../yahoo/index.js";
import { portfolioReadService } from "./portfolio-read.service.js";
import type { TransactionMutationInput, TransactionSequenceRow } from "./portfolio.types.js";

const createPositionSchema = z.object({
  symbol: z.string().trim().min(1).max(24),
  name: z.string().trim().optional(),
  quantity: z.number().positive(),
  averageBuyPrice: z.number().nonnegative(),
  currency: z.string().trim().min(3).max(8).default("EUR"),
  notes: z.string().trim().optional()
});

/**
 * `PortfolioWriteService` (anciennement `PortfolioCommandService`) : gère toutes les mutations
 * du portefeuille (createPosition, transactions CRUD, deletePosition, recompute, replace import).
 * Les opérations sont sérialisées par transaction DB et invalident les caches dérivés.
 */
export class PortfolioWriteService {
  async createPosition(input: CreatePositionInput, options: { scheduleConstruction?: boolean; userId?: number | string } = {}): Promise<PositionWithMarket> {
    const userId = requireUserId(options.userId);
    const parsed = createPositionSchema.parse({
      ...input,
      symbol: input.symbol.toUpperCase()
    });

    let quoteName: string | undefined;
    try {
      const quote = await marketSnapshotService.getQuote(parsed.symbol, { forceRefresh: true });
      quoteName = quote.name;
    } catch (error) {
      if (!isMarketDataUnavailable(error)) throw error;
    }

    const name = parsed.name || quoteName || parsed.symbol;
    const existing = portfolioRepository.findPositionBySymbol(parsed.symbol, userId);

    const position = db.transaction(() => {
      if (existing) {
        const oldQuantity = Number(existing.quantity);
        const newQuantity = oldQuantity + parsed.quantity;
        const weightedAverage =
          newQuantity === 0
            ? parsed.averageBuyPrice
            : (oldQuantity * Number(existing.average_buy_price) + parsed.quantity * parsed.averageBuyPrice) / newQuantity;

        portfolioRepository.mergePositionSnapshot(existing.id, {
          quantity: newQuantity,
          averageBuyPrice: weightedAverage,
          name,
          currency: parsed.currency
        });
      } else {
        portfolioRepository.insertPosition(
          { symbol: parsed.symbol, name, quantity: parsed.quantity, averageBuyPrice: parsed.averageBuyPrice, currency: parsed.currency },
          userId
        );
      }

      const savedPosition = portfolioRepository.findPositionBySymbol(parsed.symbol, userId)!;
      portfolioRepository.insertBuyTransactionNow(savedPosition.id, {
        quantity: parsed.quantity,
        price: parsed.averageBuyPrice,
        currency: parsed.currency
      });
      this.invalidatePositionCaches(savedPosition.id, userId, parsed.symbol);
      return savedPosition;
    });
    await marketDataService.ensureAssetInitialized(parsed.symbol);
    if (options.scheduleConstruction !== false) dataConstructionQueue.enqueueAssetConstruction(parsed.symbol);

    return portfolioReadService.enrichPosition(mapPosition(position));
  }

  ensurePosition(symbol: string, name: string, currency = "EUR", userId?: number | string): Position {
    const resolvedUserId = requireUserId(userId);
    const normalizedSymbol = symbol.toUpperCase();
    const existing = portfolioRepository.findPositionBySymbol(normalizedSymbol, resolvedUserId);
    if (existing) return mapPosition(existing);
    portfolioRepository.insertEmptyPosition({ symbol: normalizedSymbol, name, currency }, resolvedUserId);
    const created = portfolioRepository.findPositionBySymbol(normalizedSymbol, resolvedUserId)!;
    this.invalidatePositionCaches(created.id, resolvedUserId, normalizedSymbol);
    return mapPosition(created);
  }

  importAvisTransaction(input: {
    symbol: string;
    name: string;
    currency: string;
    type: "buy" | "sell";
    quantity: number;
    price: number;
    tradedAt: string;
    sourceFileName?: string | null;
    assetName?: string | null;
    isin?: string | null;
    ticker?: string | null;
    totalFees?: number | null;
    rawTextSnippet?: string | null;
  }) {
    const userId = currentUserId();
    return db.transaction(() => {
      const position = this.ensurePosition(input.symbol, input.name, input.currency, userId);
      this.assertValidTransactionMutation(position.id, {
        tradedAt: input.tradedAt,
        type: input.type,
        quantity: input.quantity,
        price: input.price,
        totalFees: input.totalFees ?? 0,
        currency: input.currency
      });
      portfolioRepository.insertImportedAvisTransaction({
        positionId: position.id,
        type: input.type,
        quantity: input.quantity,
        price: input.price,
        currency: input.currency,
        tradedAt: input.tradedAt,
        sourceFileName: input.sourceFileName,
        assetName: input.assetName,
        isin: input.isin,
        ticker: input.ticker,
        totalFees: input.totalFees,
        rawTextSnippet: input.rawTextSnippet
      });
      this.recomputePositionFromDatedTransactions(position.id);
      this.invalidatePositionCaches(position.id, userId, input.symbol);
      return position;
    });
  }

  recomputePositionFromDatedTransactions(positionId: number) {
    const rows = portfolioRepository.listRecomputeRows(positionId);
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
    portfolioRepository.updatePositionValuation(positionId, quantity, averageBuyPrice);
  }

  createTransaction(positionId: number, input: TransactionMutationInput, userId?: number | string) {
    const resolvedUserId = requireUserId(userId);
    const position = portfolioRepository.findPositionById(positionId, resolvedUserId);
    if (!position) throw new HttpError(404, "Position introuvable");
    this.assertValidTransactionMutation(positionId, input);
    db.transaction(() => {
      portfolioRepository.insertManualTransaction(positionId, input);
      this.recomputePositionFromAnyTransactions(positionId, resolvedUserId);
      this.invalidatePositionCaches(positionId, resolvedUserId);
    });
    return portfolioReadService.listTransactions(positionId, resolvedUserId);
  }

  updateTransaction(positionId: number, transactionId: number, input: TransactionMutationInput, userId?: number | string) {
    const resolvedUserId = requireUserId(userId);
    if (!portfolioRepository.findPositionById(positionId, resolvedUserId)) throw new HttpError(404, "Position introuvable");
    if (!portfolioRepository.transactionExists(positionId, transactionId)) throw new HttpError(404, "Transaction introuvable");
    this.assertValidTransactionMutation(positionId, input, transactionId);
    db.transaction(() => {
      portfolioRepository.updateManualTransaction(positionId, transactionId, input);
      this.recomputePositionFromAnyTransactions(positionId, resolvedUserId);
      this.invalidatePositionCaches(positionId, resolvedUserId);
    });
    return portfolioReadService.listTransactions(positionId, resolvedUserId);
  }

  deleteTransaction(positionId: number, transactionId: number, userId?: number | string) {
    const resolvedUserId = requireUserId(userId);
    if (!portfolioRepository.findPositionById(positionId, resolvedUserId)) throw new HttpError(404, "Position introuvable");
    db.transaction(() => {
      portfolioRepository.deleteTransaction(positionId, transactionId);
      this.recomputePositionFromAnyTransactions(positionId, resolvedUserId);
      this.invalidatePositionCaches(positionId, resolvedUserId);
    });
  }

  recomputePositionFromAnyTransactions(positionId: number, userId?: number | string) {
    const resolvedUserId = requireUserId(userId);
    const existing = portfolioRepository.findPositionById(positionId, resolvedUserId);
    if (!existing) return;
    const rows = portfolioRepository.listTransactionSequence(positionId);
    if (!rows.length) {
      this.invalidatePositionCaches(positionId, resolvedUserId, existing.symbol);
      portfolioRepository.deletePosition(positionId, resolvedUserId);
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

    portfolioRepository.updatePositionValuation(positionId, quantity, quantity > 0 ? costBasis / quantity : 0);
    portfolioReadService.persistUserAssetPosition(resolvedUserId, positionId);
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

  deletePosition(id: number, userId?: number | string): boolean {
    const resolvedUserId = requireUserId(userId);
    const existing = portfolioRepository.findPositionById(id, resolvedUserId);
    if (!existing) return false;
    db.transaction(() => {
      this.invalidatePositionCaches(id, resolvedUserId, existing.symbol);
      portfolioRepository.deletePosition(id, resolvedUserId);
    });
    return true;
  }

  replaceImportedPositionSnapshot(id: number, input: { name: string; quantity: number; averageBuyPrice: number; currency: string }, userId?: number | string) {
    const resolvedUserId = requireUserId(userId);
    const existing = portfolioRepository.findPositionById(id, resolvedUserId);
    if (!existing) throw new HttpError(404, "Position introuvable");
    db.transaction(() => {
      portfolioRepository.replaceImportedPositionSnapshot(id, input);
      this.invalidatePositionCaches(id, resolvedUserId, existing.symbol);
    });
  }

  async updatePosition(id: number, input: UpdatePositionInput, userId?: number | string): Promise<PositionWithMarket> {
    const resolvedUserId = requireUserId(userId);
    const parsed = createPositionSchema
      .omit({ symbol: true, name: true })
      .parse(input);
    const existing = portfolioRepository.findPositionById(id, resolvedUserId);
    if (!existing) throw new HttpError(404, "Position introuvable");

    db.transaction(() => {
      portfolioRepository.updatePositionSnapshot(id, {
        quantity: parsed.quantity,
        averageBuyPrice: parsed.averageBuyPrice,
        currency: parsed.currency,
        notes: parsed.notes ?? null
      });
      this.invalidatePositionCaches(id, resolvedUserId);
    });

    const row = portfolioRepository.findPositionById(id, resolvedUserId)!;
    return portfolioReadService.enrichPosition(mapPosition(row));
  }

  invalidatePositionCaches(positionId: number, userId: number | string, fallbackSymbol?: string) {
    const row = portfolioRepository.findPositionById(positionId, userId);
    invalidateUserAssetCaches(String(userId), row?.symbol ?? fallbackSymbol);
    objectiveProjectionInvalidationService.invalidateUser(userId, "portfolio position changed");
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
}

export const portfolioWriteService = new PortfolioWriteService();
