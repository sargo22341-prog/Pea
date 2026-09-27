import type { AssetChartDto, DisplayRangeKey, HistoryPoint, Quote, RangeKey } from "@pea/shared";
import { candleRepository } from "../../../repositories/candles/candle.repository.js";
import type { AssetRow } from "../../../repositories/market/asset.repository.js";
import { marketSnapshotRepository } from "../../../repositories/market/market-snapshot.repository.js";
import { marketRunRepository } from "../../../repositories/market/market-run.repository.js";
import { localTradingDate } from "../../../schedulers/market-task.utils.js";
import { logger } from "../../shared/logger.service.js";
import { chartConfigService, type ChartInterval, type StoredChartRange } from "./chart-config.service.js";
import { getMarketDateKey, getMarketSessionInfo, type YahooTradingDay } from "../calendars/marketCalendar.service.js";
import { getMarketCalendar } from "../calendars/getMarketCalendar.js";
export const storedConstructionRanges: StoredChartRange[] = ["1d", "1w", "1m", "all"];
const displayRangeByRange: Record<RangeKey, DisplayRangeKey> = { "1d": "intraday", "1w": "1W", "1m": "1M", "1y": "1Y", "5y": "5Y", "10y": "10Y", ytd: "YTD", all: "ALL" };
export const INTRADAY_CANDLE_RETENTION_OPEN_DAYS = 30;
export type ClosePointSource = "snapshot_close" | "yahoo_daily_fallback_close";
export interface ChartDataOptions {
  forceIntradayOpen?: boolean;
  intradayNow?: Date;
}
export { intradayChartCache, intradayChartMemoryStats, intradayRefreshInFlight, readIntradayChartCache, writeIntradayChartCache } from "./intraday-chart-cache.js";

export function intradayCacheKey(symbol: string, interval: ChartInterval, options: ChartDataOptions) {
  const forcedAt = options.forceIntradayOpen ? options.intradayNow?.toISOString() ?? "forced-open" : "live";
  return `${symbol.toUpperCase()}:1d:${interval}:${forcedAt}`;
}


/**
 * Compacte les points UTC en DTO leger et attache la session marche locale
 * utilisee par le frontend pour borner l'axe intraday sans hardcode.
 */
export function compactHistory(
  symbol: string,
  range: RangeKey,
  interval: string,
  points: HistoryPoint[],
  baseline?: { price: number; datetime?: string },
  marketSession = getMarketSessionInfo(symbol)
): AssetChartDto {
  const timestamps: number[] = [];
  const prices: number[] = [];
  const performance: number[] = [];
  for (const point of points) {
    const timestamp = new Date(point.date).getTime();
    if (!Number.isFinite(timestamp) || !Number.isFinite(point.close)) continue;
    timestamps.push(timestamp);
    prices.push(point.close);
    if (baseline?.price) performance.push(((point.close - baseline.price) / baseline.price) * 100);
  }
  const first = baseline?.price ?? prices[0];
  const last = prices.at(-1);
  const hasPerformance = first !== undefined && last !== undefined && Number.isFinite(first) && Number.isFinite(last);
  const performanceEuro = hasPerformance ? last - first : undefined;
  return {
    symbol,
    range: displayRangeByRange[range],
    interval,
    timestamps,
    prices,
    performanceEuro,
    performancePercent: hasPerformance && first ? ((last - first) / first) * 100 : undefined,
    baselinePrice: baseline?.price,
    baselineDatetime: baseline?.datetime,
    performance,
    marketSession,
    cachedAt: Date.now(),
    expiresAt: Date.now()
  } as AssetChartDto;
}

export function yahooInterval(interval: ChartInterval): "5m" | "15m" | "30m" | "1h" | "1d" {
  if (interval === "2h" || interval === "4h") return "1h";
  return interval;
}

export function intervalDurationMs(interval: ChartInterval) {
  const amount = Number(interval.slice(0, -1));
  const unit = interval.slice(-1);
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export function pointLabel(point?: HistoryPoint) {
  return point ? `${point.date}:${point.close}` : undefined;
}

export function storedDailyPointForTradingDay(asset: AssetRow, tradingDay: YahooTradingDay): HistoryPoint | undefined {
  const rows = candleRepository.readCandles(asset.id, "all", chartConfigService.getIntervalForRange("all"));
  return [...rows].reverse().find((point) => getMarketDateKey(asset.symbol, asset.exchange, new Date(point.date)) === tradingDay.date && Number.isFinite(point.close));
}

export function fallbackClosePoint(tradingDay: YahooTradingDay): HistoryPoint {
  return {
    date: tradingDay.period2.toISOString(),
    open: tradingDay.close,
    high: tradingDay.close,
    low: tradingDay.close,
    close: tradingDay.close
  };
}

export function snapshotLastPrice(assetId: number) {
  return marketSnapshotRepository.lastPrice(assetId);
}


export function snapshotPreviousClose(assetId: number) {
  return marketSnapshotRepository.previousClose(assetId);
}

export function latestIntradayUpdatedAt(assetId: number) {
  const datetimeStart = candleRepository.latestIntradayDatetime(assetId);
  const time = datetimeStart ? new Date(datetimeStart).getTime() : NaN;
  return Number.isFinite(time) ? time : undefined;
}

export function validQuotePrice(quote?: Quote) {
  const price = Number(quote?.price);
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

export function intradayAvailabilityStatus(asset: AssetRow, now = new Date()): AssetChartDto["availabilityStatus"] | undefined {
  const calendar = getMarketCalendar(asset.symbol, asset.exchange);
  const local = localTradingDate(now, calendar.timezone);
  const run = marketRunRepository.get(calendar.market, local.isoDate);
  if (!run || run.open_status === "pending") return "pending_open_confirmation";
  return undefined;
}

export function validateChartPoints(input: {
  symbol: string;
  range: RangeKey | StoredChartRange;
  points: HistoryPoint[];
  marketCloseTime?: Date | undefined;
}) {
  const lastRaw = input.points[input.points.length - 1];
  const byDate = new Map<string, HistoryPoint>();
  let removedLastPointReason: string | undefined;

  for (const point of input.points) {
    const date = new Date(point.date);
    const close = point.close;
    let reason: string | undefined;
    if (!Number.isFinite(date.getTime())) reason = "invalid-datetime";
    else if (!Number.isFinite(close)) reason = "invalid-price";
    else if (close <= 0) reason = "zero-or-negative-price";
    else if (input.marketCloseTime && date.getTime() > input.marketCloseTime.getTime()) reason = "after-market-close";

    if (reason) {
      logger.debug("chart", "history validation removed point", { symbol: input.symbol, range: input.range, date: point.date, close: point.close, reason });
      if (lastRaw === point) removedLastPointReason = reason;
      continue;
    }
    byDate.set(date.toISOString(), { ...point, date: date.toISOString(), close });
  }

  const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  logger.debug("chart", "history validation summary", {
    symbol: input.symbol,
    range: input.range,
    firstPoint: pointLabel(sorted[0]),
    lastPoint: pointLabel(sorted[sorted.length - 1]),
    marketCloseTime: input.marketCloseTime?.toISOString(),
    pointsBeforeValidation: input.points.length,
    pointsAfterValidation: sorted.length,
    removedLastPointReason
  });
  return sorted;
}


