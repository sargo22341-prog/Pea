import type { PortfolioPerformancePoint, Position, RangeKey } from "@pea/shared";
import { requireUserId } from "../auth/user-context.js";
import { logger } from "../shared/logger.service.js";
import {
  buildTransactionCache,
  downsamplePoints,
  getCostBasisAtTime,
  getQuantityAtTime,
  latestTransactionTime,
  positionFromTransactionCache,
  type PositionTransactionCache
} from "./portfolio-calculations.js";
import { lastSeriesTime, TransactionReplayCursor, type PriceSeries } from "./portfolio-series.js";
import { portfolioReadService } from "./portfolio-read.service.js";
import type { PortfolioMarketDataOptions } from "./portfolio.types.js";
import { positionPerformanceService } from "./position-performance.service.js";

const maxPointsByRange: Partial<Record<RangeKey, number>> = { "5y": 520, "10y": 520, all: 520 };

interface PositionSeries {
  position: Position;
  series: PriceSeries;
  fallbackPrice: number;
  entry: PositionTransactionCache | undefined;
  lastHistoryTime: number;
  latestTransactionTime: number;
}

/** Instants valides des transactions d'une position (dates illisibles ignorées). */
function transactionInstants(entry: PositionTransactionCache | undefined) {
  return (entry?.transactions ?? []).map((transaction) => new Date(transaction.traded_at).getTime()).filter(Number.isFinite);
}

export class PortfolioPerformanceService {
  async performance(range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string): Promise<PortfolioPerformancePoint[]> {
    const resolvedUserId = requireUserId(userId);
    const positions = portfolioReadService.listPositions(resolvedUserId);
    if (!positions.length) return [];
    logger.debug("portfolio", "performance calculation", { range, positions: positions.length });

    const txCache = buildTransactionCache(positions.map((p) => p.id));
    const items: PositionSeries[] = await Promise.all(
      positions.map(async (position) => {
        const series = await positionPerformanceService.safeSeries(position.symbol, range, options);
        const fallbackPrice = await positionPerformanceService.safeCurrentPrice(position);
        const entry = txCache.get(position.id);
        return { position, series, fallbackPrice, entry, lastHistoryTime: lastSeriesTime(series), latestTransactionTime: latestTransactionTime(entry) };
      })
    );
    const now = options.intradayNow?.getTime() ?? Date.now();
    const timeline = this.timeline(range, items, now);

    if (timeline.times.length < 2) {
      logger.warn("portfolio", "portfolio chart has too few points", {
        range,
        timelinePoints: timeline.times.length,
        assets: items.map((item) => `${item.position.symbol}:${item.series.times.length}`).join(",")
      });
      return [this.fallbackPoint(items)];
    }

    const maxPoints = maxPointsByRange[range];
    // Chaque point ne dépend que de son instant : échantillonner la timeline avant le calcul
    // donne exactement les mêmes points qu'échantillonner la courbe complète.
    const times = maxPoints === undefined ? timeline.times : downsamplePoints(timeline.times, maxPoints);
    return this.valuePoints(range, items, times, timeline.currentPointTime);
  }

  positionsPerformance(range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string) {
    return positionPerformanceService.positionsPerformance(range, options, userId);
  }

  singlePositionPerformance(positionId: number, range: RangeKey, options: PortfolioMarketDataOptions = {}, userId?: number | string) {
    return positionPerformanceService.singlePositionPerformance(positionId, range, options, userId);
  }

  /** Instants de la courbe : points de prix, transactions et éventuel point courant synthétique. */
  private timeline(range: RangeKey, items: PositionSeries[], now: number) {
    const needsCurrentPoint = items.some((item) => Boolean(item.entry?.transactions.length) && item.latestTransactionTime > item.lastHistoryTime);
    const latestPortfolioHistoryTime = items.reduce((latest, item) => Math.max(latest, item.lastHistoryTime), 0);
    const earliestPortfolioHistoryTime = items.reduce((earliest, item) => Math.min(earliest, item.series.times[0] ?? Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
    const currentPointTime = needsCurrentPoint ? (range === "1d" && latestPortfolioHistoryTime > 0 ? latestPortfolioHistoryTime : now) : undefined;
    const transactionStartTime = Number.isFinite(earliestPortfolioHistoryTime) ? earliestPortfolioHistoryTime : 0;

    const instants = new Set<number>();
    for (const item of items) for (const time of item.series.times) instants.add(time);
    if (range !== "1d") {
      for (const item of items) {
        for (const time of transactionInstants(item.entry)) if (time <= now && time >= transactionStartTime) instants.add(time);
      }
    }
    if (currentPointTime !== undefined) instants.add(currentPointTime);
    const times = [...instants].filter((time) => time <= now).sort((a, b) => a - b);
    return { times, currentPointTime };
  }

  private valuePoints(range: RangeKey, items: PositionSeries[], times: number[], currentPointTime: number | undefined): PortfolioPerformancePoint[] {
    const states = items.map((item) => {
      const useCurrentHolding = range === "1d" && item.latestTransactionTime > item.lastHistoryTime && item.lastHistoryTime > 0;
      return {
        item,
        priceIndex: 0,
        lastPrice: item.fallbackPrice,
        useCurrentHolding,
        currentPosition: useCurrentHolding && item.entry?.hasDated ? positionFromTransactionCache(item.position, item.entry.transactions) : item.position,
        cursor: item.entry?.hasDated ? new TransactionReplayCursor(item.entry.transactions) : undefined
      };
    });

    return times.map((time) => {
      let value = 0;
      let invested = 0;
      const isSyntheticCurrentPoint = time === currentPointTime;
      for (const state of states) {
        const { series, position } = state.item;
        while (state.priceIndex < series.times.length && (series.times[state.priceIndex] ?? Number.POSITIVE_INFINITY) <= time) {
          state.lastPrice = series.closes[state.priceIndex] ?? state.lastPrice;
          state.priceIndex += 1;
        }
        const price = isSyntheticCurrentPoint ? state.item.fallbackPrice : state.lastPrice;
        if (state.useCurrentHolding) {
          value += price * state.currentPosition.quantity;
          invested += state.currentPosition.averageBuyPrice * state.currentPosition.quantity;
        } else if (state.cursor) {
          const holding = state.cursor.advanceTo(time);
          value += price * holding.quantity;
          invested += holding.costBasis;
        } else {
          value += price * position.quantity;
          invested += position.averageBuyPrice * position.quantity;
        }
      }
      const gain = value - invested;
      // Les séries issues des graphiques ne portent pas de marqueur "stale" par point.
      return { date: new Date(time).toISOString(), value, invested, gain, gainPercent: invested ? (gain / invested) * 100 : 0, stale: false };
    });
  }

  private fallbackPoint(items: PositionSeries[]): PortfolioPerformancePoint {
    const fallbackDate = new Date().toISOString();
    const fallbackTimeMs = new Date(fallbackDate).getTime();
    const fallbackValue = items.reduce((sum, item) => {
      const quantity = item.entry?.hasDated ? getQuantityAtTime(item.entry.transactions, fallbackTimeMs) : item.position.quantity;
      return sum + item.fallbackPrice * quantity;
    }, 0);
    const fallbackInvested = items.reduce((sum, item) => {
      if (item.entry?.hasDated) return sum + getCostBasisAtTime(item.entry.transactions, fallbackTimeMs);
      return sum + item.position.averageBuyPrice * item.position.quantity;
    }, 0);
    const fallbackGain = fallbackValue - fallbackInvested;
    return { date: fallbackDate, value: fallbackValue, invested: fallbackInvested, gain: fallbackGain, gainPercent: fallbackInvested ? (fallbackGain / fallbackInvested) * 100 : 0, stale: true };
  }
}

export const portfolioPerformanceService = new PortfolioPerformanceService();
