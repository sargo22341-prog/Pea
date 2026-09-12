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
import { portfolioChartsService } from "./portfolio-charts.service.js";
import { portfolioPerformanceService } from "./portfolio-performance.service.js";
import { portfolioReadService } from "./portfolio-read.service.js";
import { portfolioWriteService } from "./portfolio-write.service.js";
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
    return portfolioReadService.listPositions(userId);
  }

  getPosition(symbol: string, userId?: number | string): Promise<PositionWithMarket | undefined> {
    return portfolioReadService.getPosition(symbol, userId);
  }

  createPosition(input: CreatePositionInput, options: { scheduleConstruction?: boolean; userId?: number | string } = {}): Promise<PositionWithMarket> {
    return portfolioWriteService.createPosition(input, options);
  }

  ensurePosition(symbol: string, name: string, currency = "EUR", userId?: number | string): Position {
    return portfolioWriteService.ensurePosition(symbol, name, currency, userId);
  }

  importAvisTransaction(input: Parameters<typeof portfolioWriteService.importAvisTransaction>[0]) {
    return portfolioWriteService.importAvisTransaction(input);
  }

  listTransactions(positionId: number, userId?: number | string): EditablePortfolioTransaction[] {
    return portfolioReadService.listTransactions(positionId, userId);
  }

  transactionStats(positionId: number, totalDividendsReceived = 0, currency = "EUR", userId?: number | string): PositionTransactionStats {
    return portfolioReadService.transactionStats(positionId, totalDividendsReceived, currency, userId);
  }

  createTransaction(positionId: number, input: TransactionMutationInput, userId?: number | string) {
    return portfolioWriteService.createTransaction(positionId, input, userId);
  }

  updateTransaction(positionId: number, transactionId: number, input: TransactionMutationInput, userId?: number | string) {
    return portfolioWriteService.updateTransaction(positionId, transactionId, input, userId);
  }

  deleteTransaction(positionId: number, transactionId: number, userId?: number | string) {
    return portfolioWriteService.deleteTransaction(positionId, transactionId, userId);
  }

  recomputePositionFromAnyTransactions(positionId: number, userId?: number | string) {
    return portfolioWriteService.recomputePositionFromAnyTransactions(positionId, userId);
  }

  assertValidTransactionMutation(positionId: number, input: TransactionMutationInput, transactionIdToReplace?: number) {
    return portfolioWriteService.assertValidTransactionMutation(positionId, input, transactionIdToReplace);
  }

  deletePosition(id: number, userId?: number | string): boolean {
    return portfolioWriteService.deletePosition(id, userId);
  }

  replaceImportedPositionSnapshot(id: number, input: { name: string; quantity: number; averageBuyPrice: number; currency: string }, userId?: number | string) {
    return portfolioWriteService.replaceImportedPositionSnapshot(id, input, userId);
  }

  updatePosition(id: number, input: UpdatePositionInput, userId?: number | string): Promise<PositionWithMarket> {
    return portfolioWriteService.updatePosition(id, input, userId);
  }

  full(range: RangeKey, userId?: string | number, options: PortfolioMarketDataOptions = {}): Promise<PortfolioFullDto> {
    return portfolioChartsService.full(range, userId, options);
  }

  summary(range: RangeKey = "1d", userId?: number | string): Promise<PortfolioSummary> {
    return portfolioReadService.summary(range, userId);
  }

  performance(range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string): Promise<PortfolioPerformancePoint[]> {
    return portfolioPerformanceService.performance(range, options, userId);
  }

  chart(range: RangeKey, userId?: string | number, options: PortfolioMarketDataOptions = {}): Promise<PortfolioChartDto> {
    return portfolioChartsService.chart(range, userId, options);
  }

  userAssetPosition(userId: string | number, symbol: string): UserAssetPositionDto | undefined {
    return portfolioReadService.userAssetPosition(userId, symbol);
  }

  positionsPerformance(range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string): Promise<PositionRangePerformance[]> {
    return portfolioPerformanceService.positionsPerformance(range, options, userId);
  }

  singlePositionPerformance(positionId: number, range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string): Promise<PositionRangePerformance> {
    return portfolioPerformanceService.singlePositionPerformance(positionId, range, options, userId);
  }
}

export const portfolioService = new PortfolioService();
