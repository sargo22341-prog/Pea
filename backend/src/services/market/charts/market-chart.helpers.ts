import type { AssetChartDto, HistoryPoint, Quote, RangeKey } from "@pea/shared";
import { db } from "../../../db.js";
import { candleRepository } from "../../../repositories/candles/candle.repository.js";
import type { AssetRow } from "../../../repositories/market/asset.repository.js";
import { marketRunRepository } from "../../../repositories/market/market-run.repository.js";
import { localTradingDate } from "../../../schedulers/market-task.utils.js";
import { logger } from "../../shared/logger.service.js";
import { chartConfigService, type ChartInterval, type StoredChartRange } from "./chart-config.service.js";
import { getLastTradingDay, getMarketDateKey, getMarketSessionInfo, getPreviousOpenMarketDays, type YahooTradingDay } from "../calendars/marketCalendar.service.js";
import { getMarketCalendar } from "../calendars/getMarketCalendar.js";
export const storedConstructionRanges: StoredChartRange[] = ["1d", "1w", "1m", "all"];
export const openMarketDayCountByRange: Partial<Record<RangeKey | StoredChartRange, number>> = {
  "1d": 1,
  "1w": 7,
  "1m": 30
};
export const INTRADAY_CANDLE_RETENTION_OPEN_DAYS = 30;
export type ClosePointSource = "snapshot_close" | "yahoo_daily_fallback_close";
export interface ChartDataOptions {
  forceIntradayOpen?: boolean;
  intradayNow?: Date;
}
export const intradayChartCache = new Map<string, { chart: AssetChartDto; expiresAt: number }>();
export const intradayRefreshInFlight = new Map<string, Promise<{ updated: number; yahooCalls: number }>>();

export function intradayCacheKey(symbol: string, interval: ChartInterval, options: ChartDataOptions) {
  const forcedAt = options.forceIntradayOpen ? options.intradayNow?.toISOString() ?? "forced-open" : "live";
  return `${symbol.toUpperCase()}:1d:${interval}:${forcedAt}`;
}

export function cloneChartDto(chart: AssetChartDto): AssetChartDto {
  return {
    ...chart,
    timestamps: [...chart.timestamps],
    prices: [...chart.prices],
    performance: chart.performance ? [...chart.performance] : undefined,
    missingAssets: chart.missingAssets ? [...chart.missingAssets] : undefined,
    missingRanges: chart.missingRanges ? [...chart.missingRanges] : undefined,
    marketSession: chart.marketSession ? { ...chart.marketSession } : undefined
  };
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
  const last = prices[prices.length - 1];
  const performanceEuro = Number.isFinite(first) && Number.isFinite(last) ? last - first : undefined;
  return {
    symbol,
    range: range === "1d" ? "intraday" : range === "1w" ? "1W" : range === "1m" ? "1M" : range === "1y" ? "1Y" : range === "5y" ? "5Y" : range === "10y" ? "10Y" : range === "ytd" ? "YTD" : range === "all" ? "ALL" : "MAX",
    interval,
    timestamps,
    prices,
    performanceEuro,
    performancePercent: first ? ((last - first) / first) * 100 : undefined,
    baselinePrice: baseline?.price,
    baselineDatetime: baseline?.datetime,
    performance,
    marketSession,
    cachedAt: Date.now(),
    expiresAt: Date.now()
  } as AssetChartDto;
}

export function openMarketWindow(asset: Pick<AssetRow, "symbol" | "exchange">, range: RangeKey | StoredChartRange, endDate = new Date()) {
  const count = openMarketDayCountByRange[range];
  if (!count) return undefined;
  const days = getPreviousOpenMarketDays({ symbol: asset.symbol, exchange: asset.exchange }, endDate, count);
  const oldest = days[days.length - 1];
  if (!oldest) return undefined;
  return {
    days,
    dateSet: new Set(days.map((day) => day.date)),
    cutoffIso: oldest.period1.toISOString(),
    period1: oldest.period1,
    period2: endDate
  };
}

export function shortRangeEndDate(asset: Pick<AssetRow, "symbol" | "exchange">, now = new Date()) {
  const session = getLastTradingDay(asset.symbol, asset.exchange, now);
  if (now.getTime() >= session.period1.getTime() && now.getTime() <= session.period2.getTime()) return now;
  return session.period2;
}

export function periodForRange(asset: Pick<AssetRow, "symbol" | "exchange">, range: StoredChartRange, now = new Date()) {
  if (range === "all") return { period1: new Date("2000-01-01"), period2: now };
  const endDate = openMarketDayCountByRange[range] ? shortRangeEndDate(asset, now) : now;
  const window = openMarketWindow(asset, range, endDate);
  if (window) return { period1: window.period1, period2: endDate };
  logger.warn("market-data", "open market window unavailable; using last trading session fallback", {
    symbol: asset.symbol,
    exchange: asset.exchange,
    range,
    endDate: endDate.toISOString()
  });
  return { period1: endDate, period2: endDate };
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

export function rangeCutoff(range: RangeKey) {
  const now = new Date();
  if (range === "1w") {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return start.getTime();
  }
  if (range === "1m") {
    const start = new Date(now);
    start.setMonth(now.getMonth() - 1);
    return start.getTime();
  }
  if (range === "ytd") return new Date(now.getFullYear(), 0, 1).getTime();
  if (range === "1y") {
    const start = new Date(now);
    start.setFullYear(now.getFullYear() - 1);
    return start.getTime();
  }
  if (range === "5y") {
    const start = new Date(now);
    start.setFullYear(now.getFullYear() - 5);
    return start.getTime();
  }
  if (range === "10y") {
    const start = new Date(now);
    start.setFullYear(now.getFullYear() - 10);
    return start.getTime();
  }
  return undefined;
}

export function filterRangePoints(points: HistoryPoint[], range: RangeKey, asset?: Pick<AssetRow, "symbol" | "exchange">, endDate = new Date()) {
  const window = asset ? openMarketWindow(asset, range, endDate) : undefined;
  if (asset && window) {
    return points.filter((point) => window.dateSet.has(getMarketDateKey(asset.symbol, asset.exchange, new Date(point.date))));
  }
  const cutoff = rangeCutoff(range);
  if (!cutoff) return points;
  return points.filter((point) => new Date(point.date).getTime() >= cutoff);
}

export function marketDateCount(points: HistoryPoint[], asset: Pick<AssetRow, "symbol" | "exchange">) {
  return new Set(points.map((point) => getMarketDateKey(asset.symbol, asset.exchange, new Date(point.date)))).size;
}

export function latestStoredMarketDatePoints(points: HistoryPoint[], asset: Pick<AssetRow, "symbol" | "exchange">) {
  const byDate = new Map<string, HistoryPoint[]>();
  for (const point of points) {
    const date = getMarketDateKey(asset.symbol, asset.exchange, new Date(point.date));
    byDate.set(date, [...(byDate.get(date) ?? []), point]);
  }
  const latestDate = [...byDate.keys()].sort().at(-1);
  return latestDate ? (byDate.get(latestDate) ?? []).sort((a, b) => a.date.localeCompare(b.date)) : [];
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
  const row = db.prepare("SELECT last_price FROM asset_market_snapshots WHERE asset_id = ?").get(assetId) as { last_price?: number } | undefined;
  const price = Number(row?.last_price);
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

export function snapshotPreviousClose(assetId: number) {
  const row = db.prepare("SELECT previous_close FROM asset_market_snapshots WHERE asset_id = ?").get(assetId) as { previous_close?: number } | undefined;
  const price = Number(row?.previous_close);
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

export function latestIntradayUpdatedAt(assetId: number) {
  const row = db.prepare("SELECT MAX(datetime_start) AS datetime_start FROM chart_candles_1d WHERE asset_id = ?").get(assetId) as
    | { datetime_start?: string | null }
    | undefined;
  const time = row?.datetime_start ? new Date(row.datetime_start).getTime() : NaN;
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
  marketCloseTime?: Date;
}) {
  const lastRaw = input.points[input.points.length - 1];
  const byDate = new Map<string, HistoryPoint>();
  let removedLastPointReason: string | undefined;

  for (const point of input.points) {
    const date = new Date(point.date);
    const close = Number(point.close);
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


