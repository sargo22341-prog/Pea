import type { AssetChartDto, Quote, RangeKey } from "@pea/shared";
import { config } from "../../../config.js";
import { candleRepository } from "../../../repositories/candles/candle.repository.js";
import { assetRepository, type AssetRow } from "../../../repositories/market/asset.repository.js";
import { logger } from "../../shared/logger.service.js";
import { getLastAvailableTradingDayFromYahoo } from "../calendars/marketCalendar.service.js";
import { getLastTradingDay, getMarketDateKey, getMarketSessionInfo, isMarketOpen } from "../calendars/marketCalendar.service.js";
import { chartConfigService, normalizeStoredRange } from "../charts/chart-config.service.js";
import {
  compactHistory,
  filterRangePoints,
  intradayAvailabilityStatus,
  intradayCacheKey,
  intervalDurationMs,
  latestStoredMarketDatePoints,
  pointLabel,
  readIntradayChartCache,
  snapshotPreviousClose,
  validateChartPoints,
  writeIntradayChartCache,
  yahooInterval,
  type ChartDataOptions
} from "../charts/market-chart.helpers.js";
import { dataConstructionQueue } from "../construction/data-construction-queue.service.js";
import { marketSnapshotService } from "../snapshots/market-snapshot.service.js";
import { marketDataGateway } from "./market-data-gateway.service.js";
import { postCloseFinalizationService } from "./post-close-finalization.service.js";
import { storedRangeRebuilderService } from "./stored-range-rebuilder.service.js";

export type EnsureAssetInitialized = (symbol: string) => Promise<AssetRow>;

export class ChartDataQueryService {
  async getChartData(symbol: string, range: RangeKey, options: ChartDataOptions = {}, ensureAssetInitialized?: EnsureAssetInitialized): Promise<AssetChartDto> {
    const existingAsset = assetRepository.findBySymbol(symbol);
    if (!existingAsset && config.enableMarketLiveRefresh) {
      return compactHistory(symbol.toUpperCase(), range, range === "1d" ? chartConfigService.getIntervalForRange("1d") : chartConfigService.getIntervalForRange(normalizeStoredRange(range)), [], undefined);
    }
    const asset = existingAsset ?? (await ensureAssetInitialized?.(symbol));
    if (!asset) throw new Error(`Asset ${symbol} is not initialized`);

    const intradayInterval = range === "1d" ? chartConfigService.getIntervalForRange("1d") : undefined;
    const cacheKey = intradayInterval ? intradayCacheKey(asset.symbol, intradayInterval, options) : undefined;
    const cached = cacheKey ? readIntradayChartCache(cacheKey) : undefined;
    if (cached) {
      logger.debug("chart", "intraday chart cache hit", { symbol: asset.symbol, cacheKey, ttlMs: cached.expiresAt - Date.now() });
      return cached;
    }

    const quote = range === "1d" ? await marketSnapshotService.getQuote(asset.symbol).catch(() => undefined) : undefined;
    const now = options.intradayNow ?? new Date();
    const forceIntradayOpen = range === "1d" && options.forceIntradayOpen;
    if (config.enableMarketLiveRefresh && !forceIntradayOpen) {
      return this.getStoredChartData(asset, range, quote, now);
    }
    if (range === "1d" && (isMarketOpen(quote?.marketState) || forceIntradayOpen)) {
      const session = getLastTradingDay(asset.symbol, quote?.exchange ?? asset.exchange, now);
      const interval = intradayInterval ?? chartConfigService.getIntervalForRange("1d");
      const period2 = new Date(Math.min(now.getTime(), session.period2.getTime()) + intervalDurationMs(interval));
      const chart = await marketDataGateway.fetchFreshChart(asset.symbol, { period1: session.period1, period2, interval: yahooInterval(interval) });
      const points = validateChartPoints({ symbol: asset.symbol, range: "1d", points: chart.quotes, marketCloseTime: session.period2 });
      const baseline = await this.getPreviousClosePrice(asset);
      logger.debug("chart", "intraday chart resolved", {
        symbol: asset.symbol,
        range: "1d",
        forcedOpen: forceIntradayOpen,
        simulatedNow: options.intradayNow?.toISOString(),
        firstPoint: pointLabel(points[0]),
        lastPoint: pointLabel(points[points.length - 1]),
        marketCloseTime: session.period2.toISOString(),
        pointsBeforeValidation: chart.quotes.length,
        pointsAfterValidation: points.length,
        baselinePrice: baseline?.price,
        baselineDatetime: baseline?.datetime
      });
      const payload = compactHistory(asset.symbol, "1d", interval, points, baseline, getMarketSessionInfo(asset.symbol, asset.exchange));
      if (cacheKey) writeIntradayChartCache(cacheKey, payload, Date.now() + intervalDurationMs(interval));
      return payload;
    }

    const storedRange = normalizeStoredRange(range);
    const interval = chartConfigService.getIntervalForRange(storedRange);
    const rawPoints = candleRepository.readCandles(asset.id, storedRange, interval);
    const points = filterRangePoints(rawPoints, range, asset);
    const latestFinalizedTradingDate = storedRange === "1d" ? candleRepository.latestFinalizedTradingDate(asset.id, "1d") : undefined;

    if (storedRange !== "1d" && !isMarketOpen(quote?.marketState)) {
      const latestFinalizedForRange = candleRepository.latestFinalizedTradingDate(asset.id, storedRange);
      const latestChartPoint = rawPoints.length ? rawPoints[rawPoints.length - 1] : undefined;
      const latestChartDate = latestChartPoint ? getMarketDateKey(asset.symbol, asset.exchange, new Date(latestChartPoint.date)) : undefined;
      if (latestFinalizedForRange && latestChartDate !== latestFinalizedForRange) {
        logger.warn("market-data", "repair rebuild because finalized flag exists but chart missing", {
          symbol: asset.symbol,
          range: storedRange,
          flagDate: latestFinalizedForRange,
          lastChartDate: latestChartDate ?? "none"
        });
        void storedRangeRebuilderService.rebuildFromFinalData(asset, [storedRange]);
      }
    }

    if (storedRange === "1d" && latestFinalizedTradingDate && !isMarketOpen(quote?.marketState) && points.length > 1) {
      logger.info("market-data", "dashboard skipped rebuild because finalized", {
        symbol: asset.symbol,
        tradingDate: latestFinalizedTradingDate,
        points: points.length
      });
      const baseline = this.getStoredPreviousClosePrice(asset);
      return compactHistory(asset.symbol, storedRange, interval, points, baseline, getMarketSessionInfo(asset.symbol, asset.exchange));
    }
    if (points.length < 2) {
      const session = getLastTradingDay(asset.symbol, asset.exchange);
      const finalized = storedRange === "1d" && candleRepository.isFinalized(asset.id, session.date, "1d");
      if (storedRange === "1d" && !isMarketOpen(quote?.marketState)) {
        if (config.enableMarketLiveRefresh) {
          const baseline = this.getStoredPreviousClosePrice(asset);
          return {
            ...compactHistory(asset.symbol, storedRange, interval, points, baseline, getMarketSessionInfo(asset.symbol, asset.exchange)),
            isPreparing: true,
            missingRanges: [storedRange]
          };
        }
        const yahooTradingDay = await getLastAvailableTradingDayFromYahoo(asset.symbol, new Date(), asset.exchange).catch(() => undefined);
        const fallbackPoints = yahooTradingDay
          ? await postCloseFinalizationService.fetchClosedIntradaySession({ asset, tradingDay: yahooTradingDay, quote, persist: true })
          : points;
        logger.info("market-data", "closed market with few intraday points; serving fallback without rebuild", {
          symbol: asset.symbol,
          range: storedRange,
          points: points.length,
          fallbackPoints: fallbackPoints.length,
          marketState: quote?.marketState,
          tradingDate: yahooTradingDay?.date
        });
        const baseline = await this.getPreviousClosePrice(asset);
        return compactHistory(asset.symbol, storedRange, interval, fallbackPoints, baseline, getMarketSessionInfo(asset.symbol, asset.exchange));
      }
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
    return this.getStoredPreviousClosePrice(asset);
  }

  getStoredPreviousClosePrice(asset: AssetRow): { price: number; datetime?: string } | undefined {
    const snapshotPrice = snapshotPreviousClose(asset.id);
    if (snapshotPrice) return { price: snapshotPrice };
    const points = candleRepository.readCandles(asset.id, "1w", chartConfigService.getIntervalForRange("1w"));
    const previous = [...points].reverse().find((point) => Number.isFinite(point.close));
    return previous ? { price: previous.close, datetime: previous.date } : undefined;
  }

  private getStoredChartData(asset: AssetRow, range: RangeKey, quote?: Quote, now = new Date()): AssetChartDto {
    const storedRange = normalizeStoredRange(range);
    const interval = chartConfigService.getIntervalForRange(storedRange);
    const rawPoints = candleRepository.readCandles(asset.id, storedRange, interval);
    const initialPoints = filterRangePoints(rawPoints, range, asset, now);
    const pendingOpen = storedRange === "1d" && intradayAvailabilityStatus(asset, now) === "pending_open_confirmation";
    let effectiveInterval = interval;
    let points = pendingOpen && initialPoints.length < 2 ? latestStoredMarketDatePoints(rawPoints, asset) : initialPoints;
    if (pendingOpen && points.length < 2) {
      const latestIntraday = candleRepository.readLatestIntradayCandles(asset.id);
      if (latestIntraday) {
        const fallbackPoints = latestStoredMarketDatePoints(latestIntraday.points, asset);
        if (fallbackPoints.length >= 2) {
          effectiveInterval = latestIntraday.interval;
          points = fallbackPoints;
        }
      }
    }
    const baseline = storedRange === "1d" ? this.getStoredPreviousClosePrice(asset) : undefined;
    const payload = compactHistory(asset.symbol, storedRange, effectiveInterval, points, baseline, getMarketSessionInfo(asset.symbol, quote?.exchange ?? asset.exchange));
    if (points.length < 2) {
      if (config.enableMarketLiveRefresh && storedRange === "1d") {
        return {
          ...payload,
          availabilityStatus: intradayAvailabilityStatus(asset, now)
        };
      }
      const job = config.enableMarketLiveRefresh ? dataConstructionQueue.enqueueCandles(asset.symbol, storedRange) : undefined;
      return {
        ...payload,
        isPreparing: true,
        missingRanges: [storedRange],
        jobId: job?.id
      };
    }
    return payload;
  }
}

export const chartDataQueryService = new ChartDataQueryService();
