import type {
  CreatePositionInput,
  EditablePortfolioTransaction,
  PortfolioChartDto,
  PortfolioFullDto,
  PortfolioPerformancePoint,
  PortfolioSummary,
  Position,
  PositionRangePerformance,
  PositionTransactionStats,
  PositionWithMarket,
  RangeKey,
  UpdatePositionInput,
  UserAssetPositionDto
} from "@pea/shared";
import { portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { portfolioChartService } from "./portfolio-chart.service.js";
import { portfolioCommandService } from "./portfolio-command.service.js";
import { portfolioPerformanceService } from "./portfolio-performance.service.js";
import { portfolioQueryService } from "./portfolio-query.service.js";
import type { PortfolioMarketDataOptions, TransactionMutationInput } from "./portfolio.types.js";

export type { PortfolioMarketDataOptions, TransactionMutationInput } from "./portfolio.types.js";

/**
 * Façade portfolio.
 *
 * Toutes les méthodes acceptent un `userId` optionnel ; quand il n'est pas fourni, les services
 * sous-jacents le récupèrent via `requireUserId()` (ALS) qui lève si aucun contexte HTTP actif
 * — empêchant tout accès silencieux aux données de l'admin (user_id=1).
 */
export class PortfolioService {
  listPositions(userId?: number | string): Position[] {
    return portfolioQueryService.listPositions(userId);
  }

  getPosition(symbol: string, userId?: number | string): Promise<PositionWithMarket | undefined> {
    return portfolioQueryService.getPosition(symbol, userId);
  }

  createPosition(input: CreatePositionInput, options: { scheduleConstruction?: boolean; userId?: number | string } = {}): Promise<PositionWithMarket> {
    return portfolioCommandService.createPosition(input, options);
  }

  ensurePosition(symbol: string, name: string, currency = "EUR", userId?: number | string): Position {
    return portfolioCommandService.ensurePosition(symbol, name, currency, userId);
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
    return portfolioCommandService.importAvisTransaction(input);
  }

  hasDatedTransactions(positionId: number): boolean {
    return portfolioRepository.hasDatedTransactions(positionId);
  }

  getQuantityHeldAtDate(assetId: number | string, date: string): number {
    const time = new Date(date).getTime();
    if (!Number.isFinite(time)) return 0;
    const rows = portfolioRepository.listQuantityEvents(Number(assetId));
    return rows.reduce((quantity, row) => {
      if (new Date(row.traded_at).getTime() > time) return quantity;
      if (row.type === "buy") return quantity + Number(row.quantity);
      if (row.type === "sell") return quantity - Number(row.quantity);
      return quantity;
    }, 0);
  }

  recomputePositionFromDatedTransactions(positionId: number) {
    return portfolioCommandService.recomputePositionFromDatedTransactions(positionId);
  }

  listTransactions(positionId: number, userId?: number | string): EditablePortfolioTransaction[] {
    return portfolioQueryService.listTransactions(positionId, userId);
  }

  transactionStats(positionId: number, totalDividendsReceived = 0, currency = "EUR", userId?: number | string): PositionTransactionStats {
    return portfolioQueryService.transactionStats(positionId, totalDividendsReceived, currency, userId);
  }

  createTransaction(positionId: number, input: TransactionMutationInput, userId?: number | string) {
    return portfolioCommandService.createTransaction(positionId, input, userId);
  }

  updateTransaction(positionId: number, transactionId: number, input: TransactionMutationInput, userId?: number | string) {
    return portfolioCommandService.updateTransaction(positionId, transactionId, input, userId);
  }

  deleteTransaction(positionId: number, transactionId: number, userId?: number | string) {
    return portfolioCommandService.deleteTransaction(positionId, transactionId, userId);
  }

  recomputePositionFromAnyTransactions(positionId: number, userId?: number | string) {
    return portfolioCommandService.recomputePositionFromAnyTransactions(positionId, userId);
  }

  assertValidTransactionMutation(positionId: number, input: TransactionMutationInput, transactionIdToReplace?: number) {
    return portfolioCommandService.assertValidTransactionMutation(positionId, input, transactionIdToReplace);
  }

  deletePosition(id: number, userId?: number | string): boolean {
    return portfolioCommandService.deletePosition(id, userId);
  }

  replaceImportedPositionSnapshot(id: number, input: { name: string; quantity: number; averageBuyPrice: number; currency: string }, userId?: number | string) {
    return portfolioCommandService.replaceImportedPositionSnapshot(id, input, userId);
  }

  updatePosition(id: number, input: UpdatePositionInput, userId?: number | string): Promise<PositionWithMarket> {
    return portfolioCommandService.updatePosition(id, input, userId);
  }

  full(range: RangeKey, userId?: string | number, options: PortfolioMarketDataOptions = {}): Promise<PortfolioFullDto> {
    return portfolioChartService.full(range, userId, options);
  }

  summary(range: RangeKey = "1d", userId?: number | string): Promise<PortfolioSummary> {
    return portfolioQueryService.summary(range, userId);
  }

  performance(range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string): Promise<PortfolioPerformancePoint[]> {
    return portfolioPerformanceService.performance(range, options, userId);
  }

  chart(range: RangeKey, userId?: string | number, options: PortfolioMarketDataOptions = {}): Promise<PortfolioChartDto> {
    return portfolioChartService.chart(range, userId, options);
  }

  userAssetPosition(userId: string | number, symbol: string): UserAssetPositionDto | undefined {
    return portfolioQueryService.userAssetPosition(userId, symbol);
  }

  positionsPerformance(range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string): Promise<PositionRangePerformance[]> {
    return portfolioPerformanceService.positionsPerformance(range, options, userId);
  }

  singlePositionPerformance(positionId: number, range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string): Promise<PositionRangePerformance> {
    return portfolioPerformanceService.singlePositionPerformance(positionId, range, options, userId);
  }
}

export const portfolioService = new PortfolioService();
