import type { Position } from "@pea/shared";
import { db } from "../../db.js";
import { mapPosition, portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { currentUserId, requireUserId } from "../auth/user-context.js";
import { objectiveProjectionInvalidationService } from "../objectives/objective-projection-invalidation.service.js";
import { invalidateUserAssetCaches } from "../shared/cache.service.js";
import { holdingAdjustments, holdingTolerance, type HoldingTarget } from "./holdings/holding-adjustment.js";
import { replayTransactions, transactionTimeMs } from "./portfolio-calculations.js";
import { portfolioReadService } from "./portfolio-read.service.js";
import type { TransactionMutationInput, TransactionSequenceRow } from "./portfolio.types.js";
import { requirePresent } from "../../utils/invariant.js";
import { splitAdjustedTransactions } from "./splits/applied-splits.js";

const negativeSaleMessage = "Cette vente rendrait la quantite detenue negative.";
const negativeDeletionMessage = "Cette suppression rendrait la quantite detenue negative.";

/** Normalise une date de transaction en ISO UTC, comme les saisies manuelles validées par l'API. */
function normalizeTradedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new HttpError(400, "Date de transaction invalide.");
  return date.toISOString();
}

/**
 * `PortfolioWriteService` : gère toutes les mutations du portefeuille (transactions CRUD,
 * imports, deletePosition, recompute). Les transactions sont l'unique source de vérité : la
 * quantité et le PRU stockés sur `positions` ne sont qu'un résultat de leur rejeu.
 * Les opérations sont sérialisées par transaction DB et invalident les caches dérivés.
 */
export class PortfolioWriteService {
  ensurePosition(symbol: string, name: string, currency = "EUR", userId?: number | string): Position {
    const resolvedUserId = requireUserId(userId);
    const normalizedSymbol = symbol.toUpperCase();
    const existing = portfolioRepository.findPositionBySymbol(normalizedSymbol, resolvedUserId);
    if (existing) return mapPosition(existing);
    portfolioRepository.insertEmptyPosition({ symbol: normalizedSymbol, name, currency }, resolvedUserId);
    const created = requirePresent(portfolioRepository.findPositionBySymbol(normalizedSymbol, resolvedUserId), "Position");
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
    const tradedAt = normalizeTradedAt(input.tradedAt);
    return db.transaction(() => {
      const position = this.ensurePosition(input.symbol, input.name, input.currency, userId);
      this.assertValidTransactionMutation(position.id, {
        tradedAt,
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
        tradedAt,
        sourceFileName: input.sourceFileName,
        assetName: input.assetName,
        isin: input.isin,
        ticker: input.ticker,
        totalFees: input.totalFees,
        rawTextSnippet: input.rawTextSnippet
      });
      this.recomputePositionFromAnyTransactions(position.id, userId);
      this.invalidatePositionCaches(position.id, userId, input.symbol);
      return position;
    });
  }
  /**
   * Applique une détention importée (export CSV sans historique) sous forme de transactions datées
   * de l'import, au lieu d'écraser la quantité et le PRU :
   * - `replace` : la position est alignée sur la détention importée (voir `holdingAdjustments`) ;
   * - `add` : la détention importée s'ajoute comme un achat à la position existante.
   * Synchrone : l'appelant peut regrouper plusieurs lignes dans une même transaction DB.
   */
  applyImportedHolding(
    input: HoldingTarget & { mode: "replace" | "add"; symbol: string; name: string; currency: string; tradedAt: string },
    userId?: number | string
  ) {
    const resolvedUserId = requireUserId(userId);
    const tradedAt = normalizeTradedAt(input.tradedAt);
    return db.transaction(() => {
      const position = this.ensurePosition(input.symbol, input.name, input.currency, resolvedUserId);
      portfolioRepository.renamePosition(position.id, input.name);
      const rows = portfolioRepository.listTransactionSequence(position.id);
      const current = replayTransactions(splitAdjustedTransactions(position.id, rows));
      const adjustments = input.mode === "replace"
        ? holdingAdjustments(current, input)
        : input.quantity > holdingTolerance ? [{ type: "buy" as const, quantity: input.quantity, price: input.averageBuyPrice }] : [];
      const nextRows: TransactionSequenceRow[] = [...(rows as TransactionSequenceRow[]), ...adjustments.map((adjustment) => ({ ...adjustment, total_fees: 0, traded_at: tradedAt }))];
      this.assertTransactionSequenceDoesNotGoNegative(position.id, nextRows, negativeSaleMessage);
      for (const adjustment of adjustments) {
        portfolioRepository.insertImportedHoldingTransaction(position.id, { ...adjustment, currency: input.currency, tradedAt });
      }
      this.recomputePositionFromAnyTransactions(position.id, resolvedUserId);
      this.invalidatePositionCaches(position.id, resolvedUserId, input.symbol);
      return position;
    });
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
    if (!portfolioRepository.transactionExists(positionId, transactionId)) throw new HttpError(404, "Transaction introuvable");
    // Supprimer un achat dont dépend une vente ultérieure rendrait l'historique incohérent.
    const remainingRows = (portfolioRepository.listTransactionSequence(positionId) as TransactionSequenceRow[]).filter((row) => Number(row.id) !== transactionId);
    this.assertTransactionSequenceDoesNotGoNegative(positionId, remainingRows, negativeDeletionMessage);
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
    const { quantity, costBasis } = replayTransactions(splitAdjustedTransactions(positionId, rows));
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
    this.assertTransactionSequenceDoesNotGoNegative(positionId, nextRows, negativeSaleMessage);
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
  invalidatePositionCaches(positionId: number, userId: number | string, fallbackSymbol?: string) {
    const row = portfolioRepository.findPositionById(positionId, userId);
    invalidateUserAssetCaches(String(userId), row?.symbol ?? fallbackSymbol);
    objectiveProjectionInvalidationService.invalidateUser(userId, "portfolio position changed");
  }
  private assertTransactionSequenceDoesNotGoNegative(positionId: number, rows: TransactionSequenceRow[], message: string) {
    let quantity = 0;
    // Quantités lues après les divisions validées : une vente postérieure porte sur des titres divisés.
    const sortedRows = [...splitAdjustedTransactions(positionId, rows)].sort((a, b) => {
      const dateOrder = transactionTimeMs(a.traded_at) - transactionTimeMs(b.traded_at);
      if (dateOrder !== 0) return dateOrder;
      return (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);
    });
    for (const row of sortedRows) {
      const rowQuantity = row.quantity;
      if (row.type === "buy") quantity += rowQuantity;
      if (row.type === "sell") quantity -= rowQuantity;
      if (quantity < -holdingTolerance) throw new HttpError(400, message);
      if (Math.abs(quantity) < holdingTolerance) quantity = 0;
    }
  }
}
export const portfolioWriteService = new PortfolioWriteService();
