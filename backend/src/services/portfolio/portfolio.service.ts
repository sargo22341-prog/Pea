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
import { db } from "../../db.js";
import { portfolioChartService } from "./portfolio-chart.service.js";
import { portfolioCommandService } from "./portfolio-command.service.js";
import { portfolioPerformanceService } from "./portfolio-performance.service.js";
import { portfolioQueryService } from "./portfolio-query.service.js";
import type { PortfolioMarketDataOptions, TransactionMutationInput } from "./portfolio.types.js";

export type { PortfolioMarketDataOptions, TransactionMutationInput } from "./portfolio.types.js";

export class PortfolioService {
  listPositions(): Position[] {
    return portfolioQueryService.listPositions();
  }

  getPosition(symbol: string): Promise<PositionWithMarket | undefined> {
    return portfolioQueryService.getPosition(symbol);
  }

  createPosition(input: CreatePositionInput, options: { scheduleConstruction?: boolean } = {}): Promise<PositionWithMarket> {
    return portfolioCommandService.createPosition(input, options);
  }

  ensurePosition(symbol: string, name: string, currency = "EUR"): Position {
    return portfolioCommandService.ensurePosition(symbol, name, currency);
  }

  hasDatedTransactions(positionId: number): boolean {
    const row = db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE position_id = ? AND traded_at IS NOT NULL").get(positionId) as { count?: number } | undefined;
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
    return portfolioCommandService.recomputePositionFromDatedTransactions(positionId);
  }

  listTransactions(positionId: number): EditablePortfolioTransaction[] {
    return portfolioQueryService.listTransactions(positionId);
  }

  transactionStats(positionId: number, totalDividendsReceived = 0, currency = "EUR"): PositionTransactionStats {
    return portfolioQueryService.transactionStats(positionId, totalDividendsReceived, currency);
  }

  createTransaction(positionId: number, input: TransactionMutationInput) {
    return portfolioCommandService.createTransaction(positionId, input);
  }

  updateTransaction(positionId: number, transactionId: number, input: TransactionMutationInput) {
    return portfolioCommandService.updateTransaction(positionId, transactionId, input);
  }

  deleteTransaction(positionId: number, transactionId: number) {
    return portfolioCommandService.deleteTransaction(positionId, transactionId);
  }

  recomputePositionFromAnyTransactions(positionId: number) {
    return portfolioCommandService.recomputePositionFromAnyTransactions(positionId);
  }

  assertValidTransactionMutation(positionId: number, input: TransactionMutationInput, transactionIdToReplace?: number) {
    return portfolioCommandService.assertValidTransactionMutation(positionId, input, transactionIdToReplace);
  }

  deletePosition(id: number): boolean {
    return portfolioCommandService.deletePosition(id);
  }

  updatePosition(id: number, input: UpdatePositionInput): Promise<PositionWithMarket> {
    return portfolioCommandService.updatePosition(id, input);
  }

  full(range: RangeKey, userId?: string | number, options: PortfolioMarketDataOptions = {}): Promise<PortfolioFullDto> {
    return portfolioChartService.full(range, userId, options);
  }

  summary(range: RangeKey = "1d"): Promise<PortfolioSummary> {
    return portfolioQueryService.summary(range);
  }

  performance(range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<PortfolioPerformancePoint[]> {
    return portfolioPerformanceService.performance(range, options);
  }

  chart(range: RangeKey, userId?: string | number, options: PortfolioMarketDataOptions = {}): Promise<PortfolioChartDto> {
    return portfolioChartService.chart(range, userId, options);
  }

  userAssetPosition(userId: string | number, symbol: string): UserAssetPositionDto | undefined {
    return portfolioQueryService.userAssetPosition(userId, symbol);
  }

  positionsPerformance(range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<PositionRangePerformance[]> {
    return portfolioPerformanceService.positionsPerformance(range, options);
  }

  singlePositionPerformance(positionId: number, range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<PositionRangePerformance> {
    return portfolioPerformanceService.singlePositionPerformance(positionId, range, options);
  }
}

export const portfolioService = new PortfolioService();
