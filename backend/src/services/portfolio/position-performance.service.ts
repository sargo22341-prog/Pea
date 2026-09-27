import type { Position, PositionMiniChart, PositionRangePerformance, Quote, RangeKey } from "@pea/shared";
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
  downsamplePoints,
  getCostBasisAtTime,
  getQuantityAtTime,
  latestTransactionTime,
  positionFromTransactionCache,
  type PositionTransactionCache
} from "./portfolio-calculations.js";
import { chartPriceSeries, emptyPriceSeries, lastSeriesTime, type PriceSeries } from "./portfolio-series.js";
import { portfolioCacheTtlMs } from "./portfolio-cache-ttl.js";
import { portfolioPerformanceCache } from "./portfolio-performance-cache.service.js";
import { portfolioReadService } from "./portfolio-read.service.js";
import type { PortfolioMarketDataOptions } from "./portfolio.types.js";

function finiteMarketNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

const miniChartMaxPoints = 40;

function shouldUseCurrentHoldingForClosedIntraday(range: RangeKey, series: PriceSeries, entry?: PositionTransactionCache) {
  const lastHistoryTime = lastSeriesTime(series);
  return range === "1d" && lastHistoryTime > 0 && latestTransactionTime(entry) > lastHistoryTime;
}

export class PositionPerformanceService {
  async positionsPerformance(range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string): Promise<PositionRangePerformance[]> {
    const resolvedUserId = requireUserId(userId);
    if (!options.forceIntradayOpen && !options.intradayNow) {
      const positions = portfolioReadService.listPositions(resolvedUserId);
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
    const positions = portfolioReadService.listPositions(userId);
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
    const [series, quoteResult] = await Promise.all([
      this.safeSeries(position.symbol, range, options),
      this.safeQuote(position)
    ]);
    const useCurrentHoldingForClosedIntraday = shouldUseCurrentHoldingForClosedIntraday(range, series, entry);
    const effectivePosition = entry?.hasDated ? positionFromTransactionCache(position, entry.transactions) : position;
    const quote = quoteResult.quote;
    const firstClose = series.closes[0];
    const lastClose = series.closes.at(-1);
    const fallbackCurrentPrice = quote?.price || effectivePosition.averageBuyPrice;
    const snapshotPrice = range === "1d" ? finiteMarketNumber(quote?.price) : undefined;
    const snapshotChange = range === "1d" ? finiteMarketNumber(quote?.change) : undefined;
    const snapshotChangePercent = range === "1d" ? finiteMarketNumber(quote?.changePercent) : undefined;
    const currentPrice = snapshotPrice || lastClose || fallbackCurrentPrice;
    const intervalStartPrice =
      (range === "1d" && quote?.previousClose ? quote.previousClose : undefined) ||
      firstClose ||
      currentPrice ||
      effectivePosition.averageBuyPrice;

    const currentMarketValue = effectivePosition.quantity * currentPrice;
    const firstPointTimeMs = series.times[0];
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
    const incompleteData = !hasSnapshotPerformance && (firstClose === undefined || lastClose === undefined || quoteResult.stale);
    const miniChart = this.positionMiniChart({
      position: effectivePosition,
      range,
      series,
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
    series: PriceSeries;
    txEntry?: PositionTransactionCache | undefined;
    useCurrentHoldingForClosedIntraday?: boolean | undefined;
    stale: boolean;
  }): PositionMiniChart {
    const sampledIndexes = downsamplePoints(input.series.times.map((_time, index) => index), miniChartMaxPoints);
    const rawPoints = sampledIndexes
      .map((index) => {
        const timestamp = input.series.times[index];
        const close = input.series.closes[index];
        if (timestamp === undefined || close === undefined) return undefined;
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
      points: rawPoints,
      marketSession: input.range === "1d" ? getMarketSessionInfo(input.position.symbol) : undefined,
      stale: input.stale,
      updatedAt: new Date().toISOString()
    };
  }

  /** Série de prix d'un actif ; vide si les données de marché sont indisponibles. */
  async safeSeries(symbol: string, range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<PriceSeries> {
    try {
      const chart = await this.getChartData(symbol, range, options);
      return chartPriceSeries(chart);
    } catch (error) {
      if (isMarketDataUnavailable(error)) return emptyPriceSeries;
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

  private async safeQuote(position: Position): Promise<{ quote?: Quote | undefined; stale: boolean }> {
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
