import type { HistoryPoint, PortfolioPerformancePoint, RangeKey } from "@pea/shared";
import { requireUserId } from "../auth/user-context.js";
import { logger } from "../shared/logger.service.js";
import {
  buildTransactionCache,
  downsamplePoints,
  getCostBasisAtTime,
  getQuantityAtTime,
  positionFromTransactionCache,
  type PositionTransactionCache
} from "./portfolio-calculations.js";
import { portfolioQueryService } from "./portfolio-query.service.js";
import type { PortfolioMarketDataOptions } from "./portfolio.types.js";
import { positionPerformanceService } from "./position-performance.service.js";

function maxHistoryTime(points: HistoryPoint[]) {
  return points.reduce((latest, point) => Math.max(latest, new Date(point.date).getTime()), 0);
}

function minHistoryTime(points: HistoryPoint[]) {
  return points.reduce((earliest, point) => {
    const time = new Date(point.date).getTime();
    return Number.isFinite(time) ? Math.min(earliest, time) : earliest;
  }, Number.POSITIVE_INFINITY);
}

function latestTransactionTime(entry?: PositionTransactionCache) {
  return entry?.transactions.reduce((latest, transaction) => Math.max(latest, new Date(transaction.traded_at).getTime()), 0) ?? 0;
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
        history: await positionPerformanceService.safeHistory(position.symbol, range, options),
        fallbackPrice: await positionPerformanceService.safeCurrentPrice(position)
      }))
    );
    const now = options.intradayNow?.getTime() ?? Date.now();
    const latestHistoryTimeByPosition = new Map<number, number>();
    const latestTransactionTimeByPosition = new Map<number, number>();
    for (const item of histories) {
      latestHistoryTimeByPosition.set(item.position.id, maxHistoryTime(item.history));
      const entry = txCache.get(item.position.id);
      latestTransactionTimeByPosition.set(item.position.id, latestTransactionTime(entry));
    }
    const transactionDates = range === "1d"
      ? []
      : [...txCache.values()]
          .flatMap((entry) => entry.transactions.map((transaction) => transaction.traded_at))
          .filter((date) => {
            const time = new Date(date).getTime();
            return Number.isFinite(time) && time <= now;
          });
    const needsCurrentPoint = histories.some((item) => {
      const entry = txCache.get(item.position.id);
      if (!entry?.transactions.length) return false;
      const lastHistoryTime = latestHistoryTimeByPosition.get(item.position.id) ?? 0;
      const lastTransactionTime = latestTransactionTimeByPosition.get(item.position.id) ?? 0;
      return lastTransactionTime > lastHistoryTime;
    });
    const latestPortfolioHistoryTime = histories.reduce(
      (latest, item) => Math.max(latest, latestHistoryTimeByPosition.get(item.position.id) ?? 0),
      0
    );
    const earliestPortfolioHistoryTime = histories.reduce((earliest, item) => Math.min(earliest, minHistoryTime(item.history)), Number.POSITIVE_INFINITY);
    const currentPointDate = needsCurrentPoint
      ? new Date(range === "1d" && latestPortfolioHistoryTime > 0 ? latestPortfolioHistoryTime : now).toISOString()
      : undefined;
    const transactionStartTime = Number.isFinite(earliestPortfolioHistoryTime) ? earliestPortfolioHistoryTime : 0;
    const timeline = [...new Set([
      ...histories.flatMap((item) => item.history.map((point) => point.date)),
      ...transactionDates.filter((date) => new Date(date).getTime() >= transactionStartTime),
      ...(currentPointDate ? [currentPointDate] : [])
    ])]
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
      const isSyntheticCurrentPoint = currentPointDate !== undefined && date === currentPointDate;

      for (const item of histories) {
        const symbol = item.position.symbol;
        let cursor = cursors.get(symbol) ?? 0;
        while (cursor < item.history.length && new Date(item.history[cursor].date).getTime() <= dateMs) {
          lastPrices.set(symbol, item.history[cursor].close);
          cursor += 1;
        }
        cursors.set(symbol, cursor);

        const entry = txCache.get(item.position.id);
        const useCurrentHoldingForClosedIntraday =
          range === "1d" &&
          (latestTransactionTimeByPosition.get(item.position.id) ?? 0) > (latestHistoryTimeByPosition.get(item.position.id) ?? 0) &&
          (latestHistoryTimeByPosition.get(item.position.id) ?? 0) > 0;
        const currentPosition = useCurrentHoldingForClosedIntraday && entry?.hasDated
          ? positionFromTransactionCache(item.position, entry.transactions)
          : item.position;
        const quantity = useCurrentHoldingForClosedIntraday
          ? currentPosition.quantity
          : entry?.hasDated ? getQuantityAtTime(entry.transactions, dateMs) : item.position.quantity;
        const price = isSyntheticCurrentPoint ? item.fallbackPrice : lastPrices.get(symbol) ?? item.fallbackPrice;
        value += price * quantity;
        invested += useCurrentHoldingForClosedIntraday
          ? currentPosition.averageBuyPrice * currentPosition.quantity
          : entry?.hasDated
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

  positionsPerformance(range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string) {
    return positionPerformanceService.positionsPerformance(range, options, userId);
  }

  singlePositionPerformance(positionId: number, range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string) {
    return positionPerformanceService.singlePositionPerformance(positionId, range, options, userId);
  }
}

export const portfolioPerformanceService = new PortfolioPerformanceService();
