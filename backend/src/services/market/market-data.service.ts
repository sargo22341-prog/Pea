/**
 * Role du fichier : orchestrer l'ajout/rafraichissement d'un asset marche.
 * Les calculs lourds se font ici, pas dans le frontend.
 */

import type { AssetChartDto, HistoryPoint, RangeKey } from "@pea/shared";
import { chartConfigService, normalizeStoredRange, type ChartInterval, type StoredChartRange } from "../chart-config.service.js";
import { getLastTradingDay, isMarketOpen } from "../marketCalendar.service.js";
import { logger } from "../logger.service.js";
import { yahooApi } from "../yahoo/yahoo.api.js";
import { candleBuilder } from "../candles/candle.builder.js";
import { candleRepository } from "../candles/candle.repository.js";
import { assetRepository, type AssetRow } from "./asset.repository.js";
import { marketSnapshotService } from "./market-snapshot.service.js";
import { financialsService } from "./financials.service.js";
import { dividendsService } from "./dividends.service.js";
import { dataConstructionQueue } from "./data-construction-queue.service.js";

function compactHistory(symbol: string, range: RangeKey, interval: string, points: HistoryPoint[], baseline?: { price: number; datetime?: string }): AssetChartDto {
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
    range: range === "1d" ? "intraday" : range === "1w" ? "1W" : range === "1m" ? "1M" : range === "1y" ? "1Y" : range === "ytd" ? "YTD" : range === "all" ? "ALL" : "MAX",
    interval,
    timestamps,
    prices,
    performanceEuro,
    performancePercent: first ? ((last - first) / first) * 100 : undefined,
    baselinePrice: baseline?.price,
    baselineDatetime: baseline?.datetime,
    performance,
    cachedAt: Date.now(),
    expiresAt: Date.now()
  } as AssetChartDto;
}

function periodForRange(range: StoredChartRange) {
  const now = new Date();
  const start = new Date(now);
  if (range === "1w") start.setDate(now.getDate() - 7);
  if (range === "1m") start.setMonth(now.getMonth() - 1);
  if (range === "1y") start.setFullYear(now.getFullYear() - 1);
  if (range === "ytd") return { period1: new Date(now.getFullYear(), 0, 1), period2: now };
  if (range === "all") return { period1: new Date("2000-01-01"), period2: now };
  return { period1: start, period2: now };
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

  async refreshCandlesForAsset(asset: AssetRow, ranges: StoredChartRange[] = ["1d", "1w", "1m", "1y", "ytd", "all"]) {
    let updated = 0;
    for (const range of ranges) {
      const interval = chartConfigService.getIntervalForRange(range);
      const session = range === "1d" ? getLastTradingDay(asset.symbol, asset.exchange) : undefined;
      const period = session ? { period1: session.period1, period2: session.period2 } : periodForRange(range);
      const periodWithInclusiveClose = session ? { ...period, period2: new Date(session.period2.getTime() + intervalDurationMs(interval)) } : period;
      const chart = await yahooApi.chart(asset.symbol, { ...periodWithInclusiveClose, interval: yahooInterval(interval) });
      const points = validateChartPoints({
        symbol: asset.symbol,
        range,
        points: chart.quotes,
        marketCloseTime: session?.period2
      });
      const candles = candleBuilder.buildCandles({
        assetId: asset.id,
        symbol: asset.symbol,
        exchange: asset.exchange,
        range,
        interval,
        points
      });
      updated += candleRepository.upsertCandles(candles);
      logger.debug("market-data", "candles rebuilt", { symbol: asset.symbol, range, interval, yahooPoints: chart.quotes.length, validatedPoints: points.length, candles: candles.length });
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
      return compactHistory(asset.symbol, "1d", interval, points, baseline);
    }

    const storedRange = normalizeStoredRange(range);
    const interval = chartConfigService.getIntervalForRange(storedRange);
    let points = candleRepository.readCandles(asset.id, storedRange, interval);
    if (storedRange === "1d") {
      const session = getLastTradingDay(asset.symbol, asset.exchange);
      const lastPointTime = new Date(points[points.length - 1]?.date ?? 0).getTime();
      if (lastPointTime < session.period2.getTime()) {
        const chart = await yahooApi.chart(asset.symbol, {
          period1: session.period1,
          period2: new Date(session.period2.getTime() + intervalDurationMs(interval)),
          interval: yahooInterval(interval)
        });
        const freshPoints = validateChartPoints({ symbol: asset.symbol, range: "1d", points: chart.quotes, marketCloseTime: session.period2 });
        const candles = candleBuilder.buildCandles({
          assetId: asset.id,
          symbol: asset.symbol,
          exchange: asset.exchange,
          range: storedRange,
          interval,
          points: freshPoints
        });
        candleRepository.upsertCandles(candles);
        points = candleRepository.readCandles(asset.id, storedRange, interval);
      }
    }
    if (points.length < 2) {
      const job = dataConstructionQueue.enqueueCandles(asset.symbol, storedRange);
      logger.warn("market-data", "chart returns few points; background rebuild queued", { symbol: asset.symbol, range: storedRange, interval, points: points.length, jobId: job.id });
      const baseline = storedRange === "1d" ? await this.getPreviousClosePrice(asset) : undefined;
      return {
        ...compactHistory(asset.symbol, storedRange, interval, points, baseline),
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
    return compactHistory(asset.symbol, storedRange, interval, points, baseline);
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
