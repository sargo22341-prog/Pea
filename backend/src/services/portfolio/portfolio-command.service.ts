import type { CreatePositionInput, Position, PositionWithMarket, UpdatePositionInput } from "@pea/shared";
import { z } from "zod";
import { db } from "../../db.js";
import { mapPosition, portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { currentUserId } from "../auth/user-context.js";
import { dataConstructionQueue } from "../market/construction/data-construction-queue.service.js";
import { marketDataService } from "../market/data/market-data.service.js";
import { marketSnapshotService } from "../market/snapshots/market-snapshot.service.js";
import { invalidateUserAssetCaches } from "../shared/cache.service.js";
import { isMarketDataUnavailable } from "../yahoo/index.js";
import { portfolioQueryService } from "./portfolio-query.service.js";
import type { TransactionMutationInput, TransactionSequenceRow } from "./portfolio.types.js";

const createPositionSchema = z.object({
  symbol: z.string().trim().min(1).max(24),
  name: z.string().trim().optional(),
  quantity: z.number().positive(),
  averageBuyPrice: z.number().nonnegative(),
  currency: z.string().trim().min(3).max(8).default("EUR"),
  notes: z.string().trim().optional()
});

export class PortfolioCommandService {
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
      if (!isMarketDataUnavailable(error)) throw error;
    }

    const name = parsed.name || quoteName || parsed.symbol;
    const existing = portfolioRepository.findPositionBySymbol(parsed.symbol);

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
        portfolioRepository.insertPosition({ symbol: parsed.symbol, name, quantity: parsed.quantity, averageBuyPrice: parsed.averageBuyPrice, currency: parsed.currency });
      }

      const savedPosition = portfolioRepository.findPositionBySymbol(parsed.symbol)!;
      portfolioRepository.insertBuyTransactionNow(savedPosition.id, {
        quantity: parsed.quantity,
        price: parsed.averageBuyPrice,
        currency: parsed.currency
      });
      this.invalidatePositionCaches(savedPosition.id, parsed.symbol);
      return savedPosition;
    });
    await marketDataService.ensureAssetInitialized(parsed.symbol);
    if (options.scheduleConstruction !== false) dataConstructionQueue.enqueueAssetConstruction(parsed.symbol);

    return portfolioQueryService.enrichPosition(mapPosition(position));
  }

  ensurePosition(symbol: string, name: string, currency = "EUR"): Position {
    const normalizedSymbol = symbol.toUpperCase();
    const existing = portfolioRepository.findPositionBySymbol(normalizedSymbol);
    if (existing) return mapPosition(existing);
    portfolioRepository.insertEmptyPosition({ symbol: normalizedSymbol, name, currency });
    const created = portfolioRepository.findPositionBySymbol(normalizedSymbol)!;
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
    return db.transaction(() => {
      const position = this.ensurePosition(input.symbol, input.name, input.currency);
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
      this.invalidatePositionCaches(position.id, input.symbol);
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

  createTransaction(positionId: number, input: TransactionMutationInput) {
    const position = portfolioRepository.findPositionById(positionId);
    if (!position) throw new HttpError(404, "Position introuvable");
    this.assertValidTransactionMutation(positionId, input);
    db.transaction(() => {
      portfolioRepository.insertManualTransaction(positionId, input);
      this.recomputePositionFromAnyTransactions(positionId);
      this.invalidatePositionCaches(positionId);
    });
    return portfolioQueryService.listTransactions(positionId);
  }

  updateTransaction(positionId: number, transactionId: number, input: TransactionMutationInput) {
    if (!portfolioRepository.findPositionById(positionId)) throw new HttpError(404, "Position introuvable");
    if (!portfolioRepository.transactionExists(positionId, transactionId)) throw new HttpError(404, "Transaction introuvable");
    this.assertValidTransactionMutation(positionId, input, transactionId);
    db.transaction(() => {
      portfolioRepository.updateManualTransaction(positionId, transactionId, input);
      this.recomputePositionFromAnyTransactions(positionId);
      this.invalidatePositionCaches(positionId);
    });
    return portfolioQueryService.listTransactions(positionId);
  }

  deleteTransaction(positionId: number, transactionId: number) {
    if (!portfolioRepository.findPositionById(positionId)) throw new HttpError(404, "Position introuvable");
    db.transaction(() => {
      portfolioRepository.deleteTransaction(positionId, transactionId);
      this.recomputePositionFromAnyTransactions(positionId);
      this.invalidatePositionCaches(positionId);
    });
  }

  recomputePositionFromAnyTransactions(positionId: number) {
    const rows = portfolioRepository.listTransactionSequence(positionId);
    if (!rows.length) {
      portfolioRepository.resetPositionValuation(positionId);
      portfolioQueryService.persistUserAssetPosition(currentUserId().toString(), positionId);
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
    portfolioQueryService.persistUserAssetPosition(currentUserId().toString(), positionId);
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

  deletePosition(id: number): boolean {
    const existing = portfolioRepository.findPositionById(id);
    if (!existing) return false;
    db.transaction(() => {
      this.invalidatePositionCaches(id);
      portfolioRepository.deletePosition(id);
    });
    return true;
  }

  replaceImportedPositionSnapshot(id: number, input: { name: string; quantity: number; averageBuyPrice: number; currency: string }) {
    const existing = portfolioRepository.findPositionById(id);
    if (!existing) throw new HttpError(404, "Position introuvable");
    db.transaction(() => {
      portfolioRepository.replaceImportedPositionSnapshot(id, input);
      this.invalidatePositionCaches(id, existing.symbol);
    });
  }

  async updatePosition(id: number, input: UpdatePositionInput): Promise<PositionWithMarket> {
    const parsed = createPositionSchema
      .omit({ symbol: true, name: true })
      .parse(input);
    const existing = portfolioRepository.findPositionById(id);
    if (!existing) throw new HttpError(404, "Position introuvable");

    db.transaction(() => {
      portfolioRepository.updatePositionSnapshot(id, {
        quantity: parsed.quantity,
        averageBuyPrice: parsed.averageBuyPrice,
        currency: parsed.currency,
        notes: parsed.notes ?? null
      });
      this.invalidatePositionCaches(id);
    });

    const row = portfolioRepository.findPositionById(id)!;
    return portfolioQueryService.enrichPosition(mapPosition(row));
  }

  invalidatePositionCaches(positionId: number, fallbackSymbol?: string) {
    const row = portfolioRepository.findPositionById(positionId);
    invalidateUserAssetCaches(currentUserId().toString(), row?.symbol ?? fallbackSymbol);
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

export const portfolioCommandService = new PortfolioCommandService();
