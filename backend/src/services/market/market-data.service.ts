/**
 * Role du fichier : orchestrer l'ajout/rafraichissement d'un asset marche.
 * Les calculs lourds se font ici, pas dans le frontend.
 */

import type { AssetChartDto, HistoryPoint, RangeKey } from "@pea/shared";
import { chartConfigService, normalizeStoredRange, type ChartInterval, type StoredChartRange } from "./chart-config.service.js";
import { getLastTradingDay, getMarketDateKey, getMarketSessionInfo, getPreviousOpenMarketDays, isMarketOpen } from "./marketCalendar.service.js";
import { logger } from "../shared/logger.service.js";
import { db } from "../../db.js";
import { yahooApi } from "../yahoo/yahoo.api.js";
import { candleBuilder } from "../candles/candle.builder.js";
import { candleRepository } from "../candles/candle.repository.js";
import { assetRepository, type AssetRow } from "./asset.repository.js";
import { marketSnapshotService } from "./market-snapshot.service.js";
import { financialsService } from "./financials.service.js";
import { dividendsService } from "./dividends.service.js";
import { dataConstructionQueue } from "./data-construction-queue.service.js";

const storedConstructionRanges: StoredChartRange[] = ["1d", "1w", "1m", "all"];
const openMarketDayCountByRange: Partial<Record<RangeKey | StoredChartRange, number>> = {
  "1w": 7,
  "1m": 30
};

/**
 * Compacte les points UTC en DTO leger et attache la session marche locale
 * utilisee par le frontend pour borner l'axe intraday sans hardcode.
 */
function compactHistory(
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

function openMarketWindow(asset: Pick<AssetRow, "symbol" | "exchange">, range: RangeKey | StoredChartRange, endDate = new Date()) {
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

function shortRangeEndDate(asset: Pick<AssetRow, "symbol" | "exchange">, now = new Date()) {
  const session = getLastTradingDay(asset.symbol, asset.exchange, now);
  if (now.getTime() >= session.period1.getTime() && now.getTime() <= session.period2.getTime()) return now;
  return session.period2;
}

function periodForRange(asset: Pick<AssetRow, "symbol" | "exchange">, range: StoredChartRange, now = new Date()) {
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

function yahooInterval(interval: ChartInterval): "5m" | "15m" | "30m" | "1h" | "1d" {
  if (interval === "2h" || interval === "4h") return "1h";
  return interval;
}

function intervalDurationMs(interval: ChartInterval) {
  const amount = Number(interval.slice(0, -1));
  const unit = interval.slice(-1);
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function pointLabel(point?: HistoryPoint) {
  return point ? `${point.date}:${point.close}` : undefined;
}

function rangeCutoff(range: RangeKey) {
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

function filterRangePoints(points: HistoryPoint[], range: RangeKey, asset?: Pick<AssetRow, "symbol" | "exchange">, endDate = new Date()) {
  const window = asset ? openMarketWindow(asset, range, endDate) : undefined;
  if (asset && window) {
    return points.filter((point) => window.dateSet.has(getMarketDateKey(asset.symbol, asset.exchange, new Date(point.date))));
  }
  const cutoff = rangeCutoff(range);
  if (!cutoff) return points;
  return points.filter((point) => new Date(point.date).getTime() >= cutoff);
}

function marketDateCount(points: HistoryPoint[], asset: Pick<AssetRow, "symbol" | "exchange">) {
  return new Set(points.map((point) => getMarketDateKey(asset.symbol, asset.exchange, new Date(point.date)))).size;
}

function validateChartPoints(input: {
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

export class MarketDataService {
  async ensureAssetInitialized(symbol: string): Promise<AssetRow> {
    const quote = await yahooApi.quote(symbol);
    const asset = assetRepository.upsertFromQuote(quote.snapshot);
    const summary = await yahooApi.quoteSummary(asset.symbol).catch(() => undefined);
    if (summary) assetRepository.upsertProfile(asset.id, summary.profile);
    await marketSnapshotService.refreshMarketSnapshot(asset);
    return asset;
  }

  async ensureAssetLoaded(symbol: string): Promise<AssetRow> {
    const asset = await this.ensureAssetInitialized(symbol);
    const candles = await this.refreshCandlesForAsset(asset);
    const snapshot = await marketSnapshotService.refreshMarketSnapshot(asset);
    const financials = await financialsService.refreshFinancials(asset).catch(() => ({ updated: 0 }));
    const dividends = await dividendsService.refreshDividends(asset).catch(() => ({ updated: 0 }));
    logger.info("market-data", "asset loaded", {
      symbol: asset.symbol,
      candles: candles.updated,
      snapshotCreated: Boolean(snapshot),
      financialRows: financials.updated,
      dividends: dividends.updated
    });
    return asset;
  }

  async refreshCandlesForAsset(asset: AssetRow, ranges: StoredChartRange[] = storedConstructionRanges) {
    let updated = 0;
    for (const range of ranges) {
      const interval = chartConfigService.getIntervalForRange(range);
      const session = range === "1d" ? getLastTradingDay(asset.symbol, asset.exchange) : undefined;
      const period = session ? { period1: session.period1, period2: session.period2 } : periodForRange(asset, range);
      const periodWithInclusiveClose = session ? { ...period, period2: new Date(session.period2.getTime() + intervalDurationMs(interval)) } : period;
      const window = openMarketWindow(asset, range, period.period2);
      logger.debug("market-data", "yahoo chart request prepared", {
        symbol: asset.symbol,
        range,
        interval,
        yahooInterval: yahooInterval(interval),
        period1: periodWithInclusiveClose.period1.toISOString(),
        period2: periodWithInclusiveClose.period2?.toISOString(),
        windowStartDate: window?.days[window.days.length - 1]?.date,
        returnedOpenDays: window?.days.length,
        requestedOpenDays: openMarketDayCountByRange[range]
      });
      const chart = await yahooApi.chart(asset.symbol, { ...periodWithInclusiveClose, interval: yahooInterval(interval) });
      const validatedPoints = validateChartPoints({
        symbol: asset.symbol,
        range,
        points: chart.quotes,
        marketCloseTime: session?.period2
      });
      const points = filterRangePoints(validatedPoints, range, asset, period.period2);
      const distinctMarketDays = marketDateCount(points, asset);
      if (window && distinctMarketDays < window.days.length) {
        logger.warn("market-data", "short range yahoo response is incomplete", {
          symbol: asset.symbol,
          range,
          requestedOpenDays: window.days.length,
          returnedMarketDays: distinctMarketDays,
          yahooPoints: chart.quotes.length,
          validatedPoints: validatedPoints.length,
          period1: periodWithInclusiveClose.period1.toISOString(),
          period2: periodWithInclusiveClose.period2?.toISOString()
        });
        if (distinctMarketDays <= 1) {
          throw new Error(`Yahoo response incomplete for ${asset.symbol} ${range}: ${distinctMarketDays}/${window.days.length} open market days`);
        }
      }
      const candles = candleBuilder.buildCandles({
        assetId: asset.id,
        symbol: asset.symbol,
        exchange: asset.exchange,
        range,
        interval,
        points
      });
      if (window) {
        candleRepository.deleteRange(asset.id, range, interval);
      }
      updated += candleRepository.upsertCandles(candles);
      if (window) candleRepository.pruneBefore(asset.id, range, interval, window.cutoffIso);
      logger.debug("market-data", "candles rebuilt", { symbol: asset.symbol, range, interval, yahooPoints: chart.quotes.length, validatedPoints: validatedPoints.length, rangePoints: points.length, returnedMarketDays: distinctMarketDays, candles: candles.length });
    }
    return { updated };
  }

  async finalizePostCloseForAsset(asset: AssetRow, now = new Date()) {
    const session = getLastTradingDay(asset.symbol, asset.exchange, now);
    if (isMarketOpen(asset.symbol, asset.exchange, now)) return { skipped: true, reason: "market-open" };
    if (now.getTime() < session.period2.getTime()) return { skipped: true, reason: "before-close" };
    if (candleRepository.isFinalized(asset.id, session.date, "1d")) return { skipped: true, reason: "already-finalized" };

    const interval = chartConfigService.getIntervalForRange("1d");
    const chart = await yahooApi.chart(asset.symbol, {
      period1: session.period1,
      period2: new Date(session.period2.getTime() + intervalDurationMs(interval)),
      interval: yahooInterval(interval)
    });
    const freshPoints = validateChartPoints({
      symbol: asset.symbol,
      range: "1d",
      points: chart.quotes,
      marketCloseTime: session.period2
    });
    const freshCandles = candleBuilder.buildCandles({
      assetId: asset.id,
      symbol: asset.symbol,
      exchange: asset.exchange,
      range: "1d",
      interval,
      points: freshPoints
    });
    candleRepository.upsertCandles(freshCandles);

    const snapshot = db.prepare("SELECT last_price FROM asset_market_snapshots WHERE asset_id = ?").get(asset.id) as { last_price?: number } | undefined;
    const closePrice = Number(snapshot?.last_price);
    if (!Number.isFinite(closePrice) || closePrice <= 0) return { skipped: true, reason: "missing-snapshot-close" };

    const closeIso = session.period2.toISOString();
    const existing = candleRepository.readCandles(asset.id, "1d", interval);
    const previous = [...existing].reverse().find((point) => new Date(point.date).getTime() < session.period2.getTime());
    const finalCandle = {
      assetId: asset.id,
      range: "1d" as const,
      interval,
      datetimeStart: closeIso,
      datetimeEnd: new Date(session.period2.getTime() + intervalDurationMs(interval)).toISOString(),
      open: previous?.close ?? closePrice,
      high: Math.max(previous?.close ?? closePrice, closePrice),
      low: Math.min(previous?.close ?? closePrice, closePrice),
      close: closePrice,
      volume: null,
      source: "snapshot_close" as const
    };
    candleRepository.upsertCandles([finalCandle]);
    candleRepository.markFinalized(asset.id, session.date, "1d");
    db.prepare("DELETE FROM chart_candles WHERE asset_id = ? AND range = 'all' AND interval = '1d' AND datetime_start >= ? AND datetime_start <= ?")
      .run(asset.id, session.period1.toISOString(), session.period2.toISOString());
    await this.rebuildStoredRangesFromFinalData(asset, session.date, closeIso, closePrice);
    return { skipped: false, finalized: true };
  }

  async rebuildStoredRangesFromFinalData(asset: AssetRow, tradingDate?: string, closeIso?: string, closePrice?: number) {
    let updated = 0;
    if (closeIso && Number.isFinite(closePrice)) {
      const finalClosePrice = Number(closePrice);
      updated += candleRepository.upsertCandles([
        {
          assetId: asset.id,
          range: "all",
          interval: "1d",
          datetimeStart: closeIso,
          datetimeEnd: new Date(new Date(closeIso).getTime() + intervalDurationMs("1d")).toISOString(),
          open: finalClosePrice,
          high: finalClosePrice,
          low: finalClosePrice,
          close: finalClosePrice,
          volume: null,
          source: "snapshot_close"
        }
      ]);
      if (tradingDate) candleRepository.markFinalized(asset.id, tradingDate, "all");
    }

    const sourcePoints = candleRepository.readCandles(asset.id, "1d", chartConfigService.getIntervalForRange("1d"));
    const endDate = closeIso ? new Date(closeIso) : new Date();
    for (const range of ["1w", "1m"] as StoredChartRange[]) {
      const interval = chartConfigService.getIntervalForRange(range);
      const points = filterRangePoints(sourcePoints, range, asset, endDate);
      const candles = candleBuilder.buildCandles({ assetId: asset.id, symbol: asset.symbol, exchange: asset.exchange, range, interval, points });
      candleRepository.deleteRange(asset.id, range, interval);
      updated += candleRepository.upsertCandles(candles.map((candle) => ({ ...candle, source: "stored_final" as const })));
      const window = openMarketWindow(asset, range, endDate);
      if (window) candleRepository.pruneBefore(asset.id, range, interval, window.cutoffIso);
      if (tradingDate) candleRepository.markFinalized(asset.id, tradingDate, range);
    }
    return { updated };
  }

  async refreshAllTrackedCandles() {
    let updated = 0;
    for (const symbol of assetRepository.listTrackedSymbols()) {
      const asset = assetRepository.findBySymbol(symbol) ?? (await this.ensureAssetLoaded(symbol));
      updated += (await this.refreshCandlesForAsset(asset)).updated;
    }
    return { updated };
  }

  async getChartData(symbol: string, range: RangeKey): Promise<AssetChartDto> {
    const asset = assetRepository.findBySymbol(symbol) ?? (await this.ensureAssetInitialized(symbol));
    if (range === "1d" && isMarketOpen(asset.symbol, asset.exchange)) {
      const quote = await marketSnapshotService.getQuote(asset.symbol);
      const session = getLastTradingDay(asset.symbol, quote.exchange);
      const interval = chartConfigService.getIntervalForRange("1d");
      const period2 = new Date(Math.min(Date.now(), session.period2.getTime()) + intervalDurationMs(interval));
      const chart = await yahooApi.chart(asset.symbol, { period1: session.period1, period2, interval: yahooInterval(interval) });
      const points = validateChartPoints({ symbol: asset.symbol, range: "1d", points: chart.quotes, marketCloseTime: session.period2 });
      const baseline = await this.getPreviousClosePrice(asset);
      logger.debug("chart", "intraday chart resolved", {
        symbol: asset.symbol,
        range: "1d",
        firstPoint: pointLabel(points[0]),
        lastPoint: pointLabel(points[points.length - 1]),
        marketCloseTime: session.period2.toISOString(),
        pointsBeforeValidation: chart.quotes.length,
        pointsAfterValidation: points.length,
        baselinePrice: baseline?.price,
        baselineDatetime: baseline?.datetime
      });
      return compactHistory(asset.symbol, "1d", interval, points, baseline, getMarketSessionInfo(asset.symbol, asset.exchange));
    }

    const storedRange = normalizeStoredRange(range);
    const interval = chartConfigService.getIntervalForRange(storedRange);
    const rawPoints = candleRepository.readCandles(asset.id, storedRange, interval);
    const points = filterRangePoints(rawPoints, range, asset);
    if (points.length < 2) {
      const session = getLastTradingDay(asset.symbol, asset.exchange);
      const finalized = storedRange === "1d" && candleRepository.isFinalized(asset.id, session.date, "1d");
      const job = finalized ? dataConstructionQueue.latest() : dataConstructionQueue.enqueueCandles(asset.symbol, storedRange);
      logger.warn("market-data", "chart returns few points; background rebuild queued", { symbol: asset.symbol, range: storedRange, interval, points: points.length, jobId: job.id });
      const baseline = storedRange === "1d" ? await this.getPreviousClosePrice(asset) : undefined;
      return {
        ...compactHistory(asset.symbol, storedRange, interval, points, baseline, getMarketSessionInfo(asset.symbol, asset.exchange)),
        isPreparing: true,
        missingRanges: [storedRange],
        jobId: job.id
      };
    }
    const baseline = storedRange === "1d" ? await this.getPreviousClosePrice(asset) : undefined;
    logger.debug("chart", "stored chart resolved", {
      symbol: asset.symbol,
      range: storedRange,
      firstPoint: pointLabel(points[0]),
      lastPoint: pointLabel(points[points.length - 1]),
      marketCloseTime: storedRange === "1d" ? getLastTradingDay(asset.symbol, asset.exchange).period2.toISOString() : undefined,
      pointsBeforeValidation: points.length,
      pointsAfterValidation: points.length,
      baselinePrice: baseline?.price,
      baselineDatetime: baseline?.datetime
    });
    return compactHistory(asset.symbol, storedRange, interval, points, baseline, getMarketSessionInfo(asset.symbol, asset.exchange));
  }

  async getPreviousClosePrice(asset: AssetRow): Promise<{ price: number; datetime?: string } | undefined> {
    const row = await marketSnapshotService.getQuote(asset.symbol);
    if (row.previousClose) return { price: row.previousClose };
    const points = candleRepository.readCandles(asset.id, "1w", chartConfigService.getIntervalForRange("1w"));
    const previous = [...points].reverse().find((point) => Number.isFinite(point.close));
    return previous ? { price: previous.close, datetime: previous.date } : undefined;
  }
}

export const marketDataService = new MarketDataService();
