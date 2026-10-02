import type { PortfolioSummary, Position, PositionTransactionStats, PositionWithMarket, Quote, RangeKey, UserAssetPositionDto } from "@pea/shared";
import { config } from "../../config.js";
import { mapPosition, portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { requireUserId } from "../auth/user-context.js";
import { marketSnapshotService } from "../market/snapshots/market-snapshot.service.js";
import { frontendBlockCache } from "../shared/frontend-block-cache.service.js";
import { logger } from "../shared/logger.service.js";
import { nowMs } from "../shared/cache.service.js";
import { isMarketDataUnavailable } from "../yahoo/index.js";
import { buildTransactionCache, computeTotalDividendsReceived, positionFromTransactionCache, type PositionTransactionCache } from "./portfolio-calculations.js";
import { portfolioCacheTtlMs } from "./portfolio-cache-ttl.js";
import { calculateTransactionStats } from "./portfolioTransactions.service.js";
import type { EditablePortfolioTransaction } from "@pea/shared";
import { appliedSplitsByPosition } from "./splits/applied-splits.js";
import { splitFactorAt, type AppliedSplit } from "./splits/split-adjustment.js";
import { withPositionSignals } from "./insights/position-signals.js";
import { portfolioYieldOnCost } from "./insights/yield-on-cost.js";

function splitFactorOrUndefined(tradedAt: string, splits: AppliedSplit[]) {
  const factor = splitFactorAt(tradedAt, splits);
  return factor === 1 ? undefined : factor;
}

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

  /**
   * Positions telles qu'affichées : quantité et PRU issus du rejeu des transactions, le snapshot
   * ne servant que pour les positions historiques qui n'en ont aucune.
   */
  listHoldings(userId?: number | string): Position[] {
    const positions = this.listPositions(userId);
    const txCache = buildTransactionCache(positions.map((position) => position.id));
    return positions.map((position) => {
      const entry = txCache.get(position.id);
      return entry?.hasDated ? positionFromTransactionCache(position, entry.transactions) : position;
    });
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
    if (!rows.length) return [];

    const splits = appliedSplitsByPosition([positionId]).get(positionId) ?? [];
    return rows.map((row) => ({
      id: String(row.id),
      positionId: row.position_id,
      assetId: String(row.position_id),
      source: row.source === "pdf_avis_opere" || row.source === "csv" ? row.source : "manual",
      sourceFileName: row.source_file_name ?? undefined,
      dateExecution: row.traded_at,
      tradedAt: row.traded_at,
      assetName: row.asset_name ?? undefined,
      isin: row.isin ?? undefined,
      ticker: row.ticker ?? undefined,
      type: row.type === "sell" ? "sell" : "buy",
      quantity: row.quantity,
      executedPrice: row.price,
      price: row.price,
      totalFees: row.total_fees ?? undefined,
      currency: row.currency,
      rawTextSnippet: row.raw_text_snippet ?? undefined,
      createdAt: row.traded_at,
      splitFactor: splitFactorOrUndefined(row.traded_at, splits)
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
      const cached = frontendBlockCache.read(cacheUserId, "portfolio-summary", range) as PortfolioSummary | undefined;
      if (cached) return cached;
    }
    const basePositions = this.listPositions(resolvedUserId);
    const { quotes: quotesBySymbol, complete: quotesComplete } = await this.quotesForPositions(basePositions, resolvedUserId);
    const txCache = buildTransactionCache(basePositions.map((p) => p.id));
    const positions = withPositionSignals(basePositions.map((position) => this.enrichPositionWithQuote(position, quotesBySymbol.get(position.symbol.toUpperCase()), txCache)));
    const totalValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
    const totalCost = positions.reduce((sum, position) => sum + position.costBasis, 0);
    const totalDividendsReceived = computeTotalDividendsReceived(positions, txCache);
    const totalFees = portfolioRepository.sumTransactionFees(resolvedUserId);
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
      positions,
      yieldOnCost: portfolioYieldOnCost(positions)
    };
    // Un résumé calculé avec un cours périmé ou absent n'est pas figé : le prochain appel, déclenché
    // par la fin du rafraîchissement en arrière-plan, le recalcule avec le cours à jour.
    if (config.enableMarketLiveRefresh && quotesComplete) frontendBlockCache.write(cacheUserId, "portfolio-summary", payload, portfolioCacheTtlMs(range, basePositions), range);
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
        quantity: cached.quantity,
        averagePrice: cached.average_price,
        transactionCount: cached.transaction_count,
        totalFees: cached.total_fees,
        investedAmount: cached.invested_amount
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
    const effectivePosition = entry?.hasDated ? positionFromTransactionCache(position, entry.transactions) : position;
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
      estimatedAnnualDividend: quote?.dividendRate ? quote.dividendRate * effectivePosition.quantity : undefined,
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
    const totalFees = transactions.reduce((sum, row) => sum + (row.total_fees ?? 0), 0);
    const investedAmount = position.quantity * position.average_buy_price;
    const payload: UserAssetPositionDto = {
      userId: cacheUserId,
      symbol: position.symbol.toUpperCase(),
      quantity: position.quantity,
      averagePrice: position.average_buy_price,
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

  /**
   * Cours des positions : le dernier cours connu est servi pendant son rafraîchissement en
   * arrière-plan, et un cours indisponible n'affecte que sa ligne (repli sur le prix de revient).
   * Une erreur autre qu'une indisponibilité de donnée de marché reste remontée. `complete` est
   * faux si un cours manque ou est périmé.
   */
  private async quotesForPositions(positions: Position[], userId: number) {
    const results = await Promise.allSettled(positions.map((position) => marketSnapshotService.getQuote(position.symbol, { allowStaleWhileRefresh: true })));
    const quotes = new Map<string, Quote>();
    const unavailableSymbols: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        quotes.set(result.value.symbol.toUpperCase(), result.value);
        return;
      }
      if (!isMarketDataUnavailable(result.reason)) throw result.reason;
      unavailableSymbols.push(positions[index]?.symbol ?? "");
    });
    if (unavailableSymbols.length) {
      logger.warn("portfolio", "portfolio quotes unavailable", { symbols: unavailableSymbols.join(","), requested: positions.length, userId });
    }
    const complete = !unavailableSymbols.length && [...quotes.values()].every((quote) => !quote.stale);
    return { quotes, complete };
  }
}

export const portfolioReadService = new PortfolioReadService();
