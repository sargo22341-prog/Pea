import type { HistoryPoint, PortfolioPerformancePoint, Position, PositionMiniChart, PositionRangePerformance, Quote, RangeKey } from "@pea/shared";
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
  positionFromTransactionCache,
  type PositionTransactionCache
} from "./portfolio-calculations.js";
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

export class PortfolioPerformanceService {
  async performance(range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string): Promise<PortfolioPerformancePoint[]> {
    const resolvedUserId = requireUserId(userId);
    const positions = portfolioQueryService.listPositions(resolvedUserId);
    if (!positions.length) return [];
    logger.debug("portfolio", "performance calculation", { range, positions: positions.length });

    const txCache = buildTransactionCache(positions.map((p) => p.id));
    const histories = await Promise.all(
      positions.map(async (position) => ({
        position,
        history: await this.safeHistory(position.symbol, range, options),
        fallbackPrice: await this.safeCurrentPrice(position)
      }))
    );
    const now = options.intradayNow?.getTime() ?? Date.now();
    const timeline = [...new Set(histories.flatMap((item) => item.history.map((point) => point.date)))]
      .filter((date) => new Date(date).getTime() <= now)
      .sort((a, b) => a.localeCompare(b));

    if (timeline.length < 2) {
      logger.warn("portfolio", "portfolio chart has too few points", {
        range,
        timelinePoints: timeline.length,
        assets: histories.map((item) => `${item.position.symbol}:${item.history.length}`).join(",")
      });
      const fallbackDate = new Date().toISOString();
      const fallbackTimeMs = new Date(fallbackDate).getTime();
      const fallbackValue = histories.reduce((sum, item) => {
        const entry = txCache.get(item.position.id);
        const quantity = entry?.hasDated ? getQuantityAtTime(entry.transactions, fallbackTimeMs) : item.position.quantity;
        return sum + item.fallbackPrice * quantity;
      }, 0);
      const fallbackInvested = histories.reduce((sum, item) => {
        const entry = txCache.get(item.position.id);
        if (entry?.hasDated) return sum + getCostBasisAtTime(entry.transactions, fallbackTimeMs);
        return sum + item.position.averageBuyPrice * item.position.quantity;
      }, 0);
      const fallbackGain = fallbackValue - fallbackInvested;
      return [{ date: fallbackDate, value: fallbackValue, invested: fallbackInvested, gain: fallbackGain, gainPercent: fallbackInvested ? (fallbackGain / fallbackInvested) * 100 : 0, stale: true }];
    }

    const cursors = new Map<string, number>();
    const lastPrices = new Map<string, number>();
    for (const item of histories) {
      cursors.set(item.position.symbol, 0);
      lastPrices.set(item.position.symbol, item.fallbackPrice);
    }

    const timelineMs = timeline.map((date) => new Date(date).getTime());
    const rawPoints = timeline.map((date, timelineIndex) => {
      let value = 0;
      let invested = 0;
      const dateMs = timelineMs[timelineIndex];

      for (const item of histories) {
        const symbol = item.position.symbol;
        let cursor = cursors.get(symbol) ?? 0;
        while (cursor < item.history.length && new Date(item.history[cursor].date).getTime() <= dateMs) {
          lastPrices.set(symbol, item.history[cursor].close);
          cursor += 1;
        }
        cursors.set(symbol, cursor);

        const entry = txCache.get(item.position.id);
        const quantity = entry?.hasDated ? getQuantityAtTime(entry.transactions, dateMs) : item.position.quantity;
        value += (lastPrices.get(symbol) ?? item.fallbackPrice) * quantity;
        invested += entry?.hasDated
          ? getCostBasisAtTime(entry.transactions, dateMs)
          : item.position.averageBuyPrice * quantity;
      }

      const gain = value - invested;
      return { date, value, invested, gain, gainPercent: invested ? (gain / invested) * 100 : 0, stale: histories.some((item) => item.history.some((point) => point.stale)) };
    });

    const maxPointsByRange: Partial<Record<RangeKey, number>> = { "5y": 520, "10y": 520, all: 520 };
    const maxPoints = maxPointsByRange[range];
    return maxPoints !== undefined ? downsamplePoints(rawPoints, maxPoints) : rawPoints;
  }

  async positionsPerformance(range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string): Promise<PositionRangePerformance[]> {
    const resolvedUserId = requireUserId(userId);
    if (!options.forceIntradayOpen && !options.intradayNow) {
      return portfolioPerformanceCache.getOrCompute({
        userId: resolvedUserId,
        range,
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
    const effectivePosition = entry?.hasDated ? positionFromTransactionCache(position, entry.transactions) : position;

    const [history, quoteResult] = await Promise.all([
      this.safeHistory(effectivePosition.symbol, range, options),
      this.safeQuote(effectivePosition)
    ]);
    const quote = quoteResult.quote;
    const validHistory = history.filter((point) => Number.isFinite(point.close)).sort((a, b) => a.date.localeCompare(b.date));
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
    const intervalQuantity = entry?.hasDated && firstPointTimeMs !== undefined
      ? getQuantityAtTime(entry.transactions, firstPointTimeMs)
      : effectivePosition.quantity;
    const totalCost = effectivePosition.quantity * effectivePosition.averageBuyPrice;
    const intervalStartMarketValue = intervalQuantity * intervalStartPrice;
    const intervalStartCost = entry?.hasDated && firstPointTimeMs !== undefined
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
    stale: boolean;
  }): PositionMiniChart {
    const sampledHistory = downsampleHistoryForMiniChart(input.history, 40);
    const rawPoints = sampledHistory
      .map((point) => {
        const timestamp = new Date(point.date).getTime();
        const close = Number(point.close);
        if (!Number.isFinite(timestamp) || !Number.isFinite(close)) return undefined;
        const quantity = input.txEntry?.hasDated
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

  private async safeHistory(symbol: string, range: RangeKey, options: PortfolioMarketDataOptions = {}): Promise<HistoryPoint[]> {
    try {
      const chart = await marketDataService.getChartData(symbol, range, options);
      return chart.timestamps.map((timestamp, index) => ({
        date: new Date(timestamp).toISOString(),
        close: chart.prices[index]
      }));
    } catch (error) {
      if (isMarketDataUnavailable(error)) return [];
      throw error;
    }
  }

  private async safeCurrentPrice(position: Position) {
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
}

export const portfolioPerformanceService = new PortfolioPerformanceService();
