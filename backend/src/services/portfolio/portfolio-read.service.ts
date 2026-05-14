import type { PortfolioSummary, Position, PositionTransactionStats, PositionWithMarket, Quote, RangeKey, UserAssetPositionDto } from "@pea/shared";
import { config } from "../../config.js";
import { mapPosition, portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { currentUserId, requireUserId } from "../auth/user-context.js";
import { chartConfigService } from "../market/charts/chart-config.service.js";
import { marketSnapshotService } from "../market/snapshots/market-snapshot.service.js";
import { frontendBlockCache } from "../shared/frontend-block-cache.service.js";
import { logger } from "../shared/logger.service.js";
import { nowMs } from "../shared/cache.service.js";
import { isMarketDataUnavailable } from "../yahoo/index.js";
import { buildTransactionCache, computeTotalDividendsReceived, positionFromTransactionCache, type PositionTransactionCache } from "./portfolio-calculations.js";
import { calculateTransactionStats, legacyTransactionFromPosition } from "./portfolioTransactions.service.js";
import type { EditablePortfolioTransaction } from "@pea/shared";

/**
 * `PortfolioReadService` (anciennement `PortfolioQueryService`) : lectures pures du portefeuille
 * (listPositions, getPosition, summary, listTransactions, transactionStats, userAssetPosition,
 * enrichPosition, persistUserAssetPosition). Aucune mutation directe — les services de
 * `PortfolioWriteService` invalident les caches que ce service consomme.
 */
export class PortfolioReadService {
  listPositions(userId?: number | string): Position[] {
    const resolved = requireUserId(userId);
    const rows = portfolioRepository.listPositions(resolved);
    return rows.map(mapPosition);
  }

  async getPosition(symbol: string, userId?: number | string): Promise<PositionWithMarket | undefined> {
    const resolved = requireUserId(userId);
    const row = portfolioRepository.findPositionBySymbol(symbol, resolved);
    if (!row) return undefined;
    return this.enrichPosition(mapPosition(row));
  }

  listTransactions(positionId: number, userId?: number | string): EditablePortfolioTransaction[] {
    const resolved = requireUserId(userId);
    const ownedPosition = portfolioRepository.findPositionById(positionId, resolved);
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

  transactionStats(positionId: number, totalDividendsReceived = 0, currency = "EUR", userId?: number | string): PositionTransactionStats {
    const rows = this.listTransactions(positionId, userId);
    return calculateTransactionStats(rows, totalDividendsReceived, currency);
  }

  async summary(range: RangeKey = "1d", userId?: number | string): Promise<PortfolioSummary> {
    const resolvedUserId = requireUserId(userId);
    const cacheUserId = String(resolvedUserId);
    if (config.enableMarketLiveRefresh) {
      const cached = frontendBlockCache.read<PortfolioSummary>(cacheUserId, "portfolio-summary", range);
      if (cached) return cached;
    }
    const basePositions = this.listPositions(resolvedUserId);
    const quotesBySymbol = await this.quotesForPositions(basePositions);
    const txCache = buildTransactionCache(basePositions.map((p) => p.id));
    const positions = basePositions.map((position) => this.enrichPositionWithQuote(position, quotesBySymbol.get(position.symbol.toUpperCase()), txCache));
    const totalValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
    const totalCost = positions.reduce((sum, position) => sum + position.costBasis, 0);
    const totalDividendsReceived = computeTotalDividendsReceived(positions, txCache);
    const totalFees = portfolioRepository.listPositions(resolvedUserId)
      .flatMap((position) => portfolioRepository.listTransactionSequence(position.id))
      .reduce((sum, transaction) => sum + Number(transaction.total_fees ?? 0), 0);
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
    if (config.enableMarketLiveRefresh) frontendBlockCache.write(cacheUserId, "portfolio-summary", payload, chartConfigService.getSnapshotRefreshIntervalMs(), range);
    return payload;
  }

  userAssetPosition(userId: string | number, symbol: string): UserAssetPositionDto | undefined {
    const resolvedUserId = requireUserId(userId);
    const cacheUserId = String(resolvedUserId);
    const key = symbol.toUpperCase();
    const cached = portfolioRepository.findUserAssetPosition(resolvedUserId, key);
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

    const position = portfolioRepository.findPositionBySymbol(key, resolvedUserId);
    if (!position) return undefined;
    return this.persistUserAssetPosition(cacheUserId, position.id);
  }

  async enrichPosition(position: Position): Promise<PositionWithMarket> {
    let quote;
    try {
      quote = await marketSnapshotService.getQuote(position.symbol);
    } catch (error) {
      if (!isMarketDataUnavailable(error)) throw error;
    }

    return this.enrichPositionWithQuote(position, quote);
  }

  enrichPositionWithQuote(position: Position, quote?: Quote, txCache?: Map<number, PositionTransactionCache>): PositionWithMarket {
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

  persistUserAssetPosition(userId: string | number, positionId: number): UserAssetPositionDto | undefined {
    const resolved = requireUserId(userId);
    const cacheUserId = String(resolved);
    const position = portfolioRepository.findPositionById(positionId, resolved);
    if (!position) return undefined;
    const transactions = portfolioRepository.listTransactionSequence(positionId);
    const transactionCount = transactions.length;
    const totalFees = transactions.reduce((sum, row) => sum + Number(row.total_fees ?? 0), 0);
    const investedAmount = Number(position.quantity) * Number(position.average_buy_price);
    const payload: UserAssetPositionDto = {
      userId: cacheUserId,
      symbol: String(position.symbol).toUpperCase(),
      quantity: Number(position.quantity),
      averagePrice: Number(position.average_buy_price),
      transactionCount,
      totalFees,
      investedAmount
    };
    portfolioRepository.upsertUserAssetPosition({
      user_id: payload.userId,
      symbol: payload.symbol,
      quantity: payload.quantity,
      average_price: payload.averagePrice,
      transaction_count: payload.transactionCount,
      total_fees: payload.totalFees,
      invested_amount: payload.investedAmount,
      updatedAt: nowMs()
    });
    return payload;
  }

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
        error: error instanceof Error ? error.message : String(error),
        userId: currentUserId()
      });
      return new Map<string, Quote>();
    }
  }
}

export const portfolioReadService = new PortfolioReadService();
