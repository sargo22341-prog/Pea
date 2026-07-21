import type { HistoryPoint, Position, PositionMiniChart, PositionRangePerformance, Quote, RangeKey } from "@pea/shared";
import { HttpError } from "../../utils/http-error.js";
import { mapPosition, portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { requireUserId } from "../auth/user-context.js";
import { getMarketSessionInfo } from "../market/calendars/marketCalendar.service.js";
import { marketDataService } from "../market/data/market-data.service.js";
import { marketSnapshotService } from "../market/snapshots/market-snapshot.service.js";
import { logger } from "../shared/logger.service.js";
import { isMarketDataUnavailable } from "../yahoo/index.js";
import {
  buildTransactionCache,
  getCostBasisAtTime,
  getQuantityAtTime,
  positionFromTransactionCache,
  type PositionTransactionCache
} from "./portfolio-calculations.js";
import { portfolioCacheTtlMs } from "./portfolio-cache-ttl.js";
import { portfolioPerformanceCache } from "./portfolio-performance-cache.service.js";
import { portfolioQueryService } from "./portfolio-query.service.js";
import type { PortfolioMarketDataOptions } from "./portfolio.types.js";

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

function maxHistoryTime(points: HistoryPoint[]) {
  return points.reduce((latest, point) => Math.max(latest, new Date(point.date).getTime()), 0);
}

function latestTransactionTime(entry?: PositionTransactionCache) {
  return entry?.transactions.reduce((latest, transaction) => Math.max(latest, new Date(transaction.traded_at).getTime()), 0) ?? 0;
}

function shouldUseCurrentHoldingForClosedIntraday(range: RangeKey, history: HistoryPoint[], entry?: PositionTransactionCache) {
  const lastHistoryTime = maxHistoryTime(history);
  return range === "1d" && lastHistoryTime > 0 && latestTransactionTime(entry) > lastHistoryTime;
}

export class PositionPerformanceService {
  async positionsPerformance(range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string): Promise<PositionRangePerformance[]> {
    const resolvedUserId = requireUserId(userId);
    if (!options.forceIntradayOpen && !options.intradayNow) {
      const positions = portfolioQueryService.listPositions(resolvedUserId);
      return portfolioPerformanceCache.getOrCompute({
        userId: resolvedUserId,
        range,
        ttlMs: portfolioCacheTtlMs(range, positions),
        compute: () => this.calculatePositionsPerformance(range, options, resolvedUserId)
      });
    }
    return this.calculatePositionsPerformance(range, options, resolvedUserId);
  }

  async singlePositionPerformance(positionId: number, range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string): Promise<PositionRangePerformance> {
    const resolvedUserId = requireUserId(userId);
    const row = portfolioRepository.findPositionById(positionId, resolvedUserId);
    if (!row) throw new HttpError(404, "Position introuvable");
    logger.debug("portfolio", "single position performance calculation", { range, positionId });
    return this.positionRangePerformance(mapPosition(row), range, options);
  }

  private async calculatePositionsPerformance(range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string): Promise<PositionRangePerformance[]> {
    const positions = portfolioQueryService.listPositions(userId);
    logger.debug("portfolio", "positions performance calculation", { range, positions: positions.length });
    const txCache = buildTransactionCache(positions.map((p) => p.id));
    return Promise.all(positions.map((position) => this.positionRangePerformance(position, range, options, txCache)));
  }

  private async positionRangePerformance(
    position: Position,
    range: RangeKey,
    options: PortfolioMarketDataOptions = {},
    txCache?: Map<number, PositionTransactionCache>
  ): Promise<PositionRangePerformance> {
    const cache = txCache ?? buildTransactionCache([position.id]);
    const entry = cache.get(position.id);
    const [history, quoteResult] = await Promise.all([
      this.safeHistory(position.symbol, range, options),
      this.safeQuote(position)
    ]);
    const validHistory = history.filter((point) => Number.isFinite(point.close)).sort((a, b) => a.date.localeCompare(b.date));
    const useCurrentHoldingForClosedIntraday = shouldUseCurrentHoldingForClosedIntraday(range, validHistory, entry);
    const effectivePosition = entry?.hasDated ? positionFromTransactionCache(position, entry.transactions) : position;
    const quote = quoteResult.quote;
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
    const intervalQuantity = useCurrentHoldingForClosedIntraday
      ? effectivePosition.quantity
      : entry?.hasDated && firstPointTimeMs !== undefined
      ? getQuantityAtTime(entry.transactions, firstPointTimeMs)
      : effectivePosition.quantity;
    const totalCost = effectivePosition.quantity * effectivePosition.averageBuyPrice;
    const intervalStartMarketValue = intervalQuantity * intervalStartPrice;
    const intervalStartCost = useCurrentHoldingForClosedIntraday
      ? totalCost
      : entry?.hasDated && firstPointTimeMs !== undefined
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
      useCurrentHoldingForClosedIntraday,
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
    useCurrentHoldingForClosedIntraday?: boolean;
    stale: boolean;
  }): PositionMiniChart {
    const sampledHistory = downsampleHistoryForMiniChart(input.history, 40);
    const rawPoints = sampledHistory
      .map((point) => {
        const timestamp = new Date(point.date).getTime();
        const close = Number(point.close);
        if (!Number.isFinite(timestamp) || !Number.isFinite(close)) return undefined;
        const quantity = input.useCurrentHoldingForClosedIntraday
          ? input.position.quantity
          : input.txEntry?.hasDated
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

  async safeHistory(symbol: string, range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<HistoryPoint[]> {
    try {
      const chart = await this.getChartData(symbol, range, options);
      return chart.timestamps.map((timestamp, index) => ({
        date: new Date(timestamp).toISOString(),
        close: chart.prices[index]
      }));
    } catch (error) {
      if (isMarketDataUnavailable(error)) return [];
      throw error;
    }
  }

  async safeCurrentPrice(position: Position) {
    try {
      const quote = await marketSnapshotService.getQuote(position.symbol);
      return quote.price || position.averageBuyPrice;
    } catch (error) {
      if (isMarketDataUnavailable(error)) return position.averageBuyPrice;
      throw error;
    }
  }

  private async safeQuote(position: Position): Promise<{ quote?: Quote; stale: boolean }> {
    try {
      const quote = await marketSnapshotService.getQuote(position.symbol);
      return { quote, stale: Boolean(quote.stale || quote.unavailable) };
    } catch (error) {
      if (isMarketDataUnavailable(error)) return { quote: undefined, stale: true };
      throw error;
    }
  }

  private getChartData(symbol: string, range: RangeKey, options: PortfolioMarketDataOptions = {}) {
    if (!options.chartDataCache) return marketDataService.getChartData(symbol, range, options);
    const key = `${symbol.toUpperCase()}:${range}`;
    const cached = options.chartDataCache.get(key);
    if (cached) return cached;
    const promise = marketDataService.getChartData(symbol, range, options);
    options.chartDataCache.set(key, promise);
    return promise;
}

}
export const positionPerformanceService = new PositionPerformanceService();
