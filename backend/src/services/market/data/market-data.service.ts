import type { Quote, RangeKey } from "@pea/shared";
import { candleRepository } from "../../../repositories/candles/candle.repository.js";
import { assetRepository, type AssetRow } from "../../../repositories/market/asset.repository.js";
import { candleBuilder } from "../../candles/candle.builder.js";
import { logger } from "../../shared/logger.service.js";
import { pruneIntradayCache } from "../../yahoo/cache/history.cache.js";
import {
  getLastAvailableTradingDayFromYahoo,
  getLastTradingDay,
  getPreviousOpenMarketDays,
  isMarketOpen,
  type OpenMarketDay,
  type YahooTradingDay
} from "../calendars/marketCalendar.service.js";
import { chartConfigService, type StoredChartRange } from "../charts/chart-config.service.js";
import {
  INTRADAY_CANDLE_RETENTION_OPEN_DAYS,
  fallbackClosePoint,
  filterRangePoints,
  intervalDurationMs,
  marketDateCount,
  openMarketDayCountByRange,
  openMarketWindow,
  periodForRange,
  storedConstructionRanges,
  storedDailyPointForTradingDay,
  validateChartPoints,
  yahooInterval,
  type ChartDataOptions
} from "../charts/market-chart.helpers.js";
import { dividendsService } from "../dividends/dividends.service.js";
import { financialsService } from "../financials/financials.service.js";
import { marketSnapshotService } from "../snapshots/market-snapshot.service.js";
import { chartDataQueryService } from "./chart-data-query.service.js";
import { liveIntradayService } from "./live-intraday.service.js";
import { marketDataGateway } from "./market-data-gateway.service.js";
import { postCloseFinalizationService } from "./post-close-finalization.service.js";
import { storedRangeRebuilderService } from "./stored-range-rebuilder.service.js";

export type { ChartDataOptions } from "../charts/market-chart.helpers.js";

export class MarketDataService {
  async ensureAssetInitialized(symbol: string): Promise<AssetRow> {
    const quote = await marketDataGateway.fetchFreshQuote(symbol);
    const asset = assetRepository.upsertFromQuote(quote.snapshot);
    const summary = await marketDataGateway.fetchFreshQuoteSummary(asset.symbol).catch(() => undefined);
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
    let latestYahooTradingDay: YahooTradingDay | undefined;
    for (const range of ranges) {
      const interval = chartConfigService.getIntervalForRange(range);
      let session: OpenMarketDay | undefined;
      let quote: Quote | undefined;
      if (range === "1d") {
        quote = await marketSnapshotService.getQuote(asset.symbol).catch(() => undefined);
        latestYahooTradingDay = isMarketOpen(quote?.marketState) ? undefined : await getLastAvailableTradingDayFromYahoo(asset.symbol, new Date(), asset.exchange).catch(() => undefined);
        session = latestYahooTradingDay ?? getLastTradingDay(asset.symbol, asset.exchange);
      }
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
      const chart = await marketDataGateway.fetchFreshChart(asset.symbol, { ...periodWithInclusiveClose, interval: yahooInterval(interval) });
      let validatedPoints = validateChartPoints({
        symbol: asset.symbol,
        range,
        points: chart.quotes,
        marketCloseTime: session?.period2
      });
      if (range === "1d" && validatedPoints.length === 0) {
        latestYahooTradingDay = latestYahooTradingDay ?? (await getLastAvailableTradingDayFromYahoo(asset.symbol, new Date(), asset.exchange).catch(() => undefined));
        validatedPoints = latestYahooTradingDay
          ? await postCloseFinalizationService.fetchClosedIntradaySession({ asset, tradingDay: latestYahooTradingDay, quote, persist: false })
          : [];
        if (latestYahooTradingDay) {
          session = latestYahooTradingDay;
          logger.info("market-data", "intraday empty; yahoo daily fallback used", {
            symbol: asset.symbol,
            tradingDate: latestYahooTradingDay.date,
            intradayPoints: validatedPoints.length
          });
        }
      }
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
      if (range === "1d" && session && candles.length > 0) {
        const retentionDays = getPreviousOpenMarketDays({ symbol: asset.symbol, exchange: asset.exchange }, session.period2, INTRADAY_CANDLE_RETENTION_OPEN_DAYS);
        const oldest = retentionDays.at(-1);
        if (oldest) {
          candleRepository.pruneBefore(asset.id, "1d", interval, oldest.period1.toISOString());
          logger.debug("market-data", "1d candles pruned", { symbol: asset.symbol, cutoffIso: oldest.period1.toISOString(), retentionOpenDays: INTRADAY_CANDLE_RETENTION_OPEN_DAYS });
        }
        pruneIntradayCache(asset.symbol);
      }
      if (range === "1d" && session && quote && !isMarketOpen(quote.marketState)) {
        logger.info("market-data", "1d rebuild completed before finalization", {
          symbol: asset.symbol,
          tradingDate: session.date,
          marketCloseTime: session.period2.toISOString(),
          candles: candles.length
        });
        await postCloseFinalizationService.finalizeClosedOneDayCandles({
          asset,
          session,
          quote,
          yahooTradingDay: latestYahooTradingDay,
          rebuildContext: "forced-rebuild"
        });
      }
      if (window) candleRepository.pruneBefore(asset.id, range, interval, window.cutoffIso);
      logger.debug("market-data", "candles rebuilt", { symbol: asset.symbol, range, interval, yahooPoints: chart.quotes.length, validatedPoints: validatedPoints.length, rangePoints: points.length, returnedMarketDays: distinctMarketDays, candles: candles.length });
    }
    return { updated };
  }

  async finalizePostCloseForAsset(asset: AssetRow, now = new Date()) {
    const persistedQuote = marketSnapshotService.readSnapshot(asset.id);
    const quote = persistedQuote && !isMarketOpen(persistedQuote.marketState)
      ? persistedQuote
      : await marketSnapshotService.getQuote(asset.symbol).catch(() => undefined);
    if (isMarketOpen(quote?.marketState)) return { skipped: true, reason: "market-open" };
    const yahooTradingDay = await getLastAvailableTradingDayFromYahoo(asset.symbol, now, asset.exchange).catch(() => undefined);
    const session = yahooTradingDay ?? getLastTradingDay(asset.symbol, asset.exchange, now);
    if (now.getTime() < session.period2.getTime()) return { skipped: true, reason: "before-close" };
    if (candleRepository.isFinalized(asset.id, session.date, "1d")) return { skipped: true, reason: "already-finalized" };
    logger.info("market-data", "post-close rebuild started", { symbol: asset.symbol, tradingDate: session.date });

    const interval = chartConfigService.getIntervalForRange("1d");
    const chart = await marketDataGateway.fetchFreshChart(asset.symbol, {
      period1: session.period1,
      period2: new Date(session.period2.getTime() + intervalDurationMs(interval)),
      interval: yahooInterval(interval)
    });
    let freshPoints = validateChartPoints({
      symbol: asset.symbol,
      range: "1d",
      points: chart.quotes,
      marketCloseTime: session.period2
    });
    if (freshPoints.length === 0 && yahooTradingDay) freshPoints = [storedDailyPointForTradingDay(asset, yahooTradingDay) ?? fallbackClosePoint(yahooTradingDay)];
    const freshCandles = candleBuilder.buildCandles({
      assetId: asset.id,
      symbol: asset.symbol,
      exchange: asset.exchange,
      range: "1d",
      interval,
      points: freshPoints
    });
    candleRepository.upsertCandles(freshCandles);

    return postCloseFinalizationService.finalizeClosedOneDayCandles({
      asset,
      session,
      quote,
      yahooTradingDay,
      rebuildContext: "post-close"
    });
  }

  rebuildStoredRangesFromFinalData(
    asset: AssetRow,
    ranges: StoredChartRange[] = ["1w", "1m", "all"],
    options: { tradingDate?: string; closeIso?: string; closePrice?: number } = {}
  ) {
    return storedRangeRebuilderService.rebuildFromFinalData(asset, ranges, options);
  }

  async refreshAllTrackedCandles() {
    let updated = 0;
    for (const symbol of assetRepository.listTrackedSymbols()) {
      const asset = assetRepository.findBySymbol(symbol) ?? (await this.ensureAssetLoaded(symbol));
      updated += (await this.refreshCandlesForAsset(asset)).updated;
    }
    return { updated };
  }

  refreshLiveIntradayForAssets(assets: AssetRow[], now = new Date(), options: { minAgeMs?: number; force?: boolean } = {}) {
    return liveIntradayService.refreshForAssets(assets, now, options);
  }

  refreshLiveIntradayForAsset(asset: AssetRow, now = new Date()) {
    return liveIntradayService.refreshForAsset(asset, now);
  }

  isIntradayRefreshInFlight(symbol: string) {
    return liveIntradayService.isRefreshInFlight(symbol);
  }

  isIntradayChartCacheFresh(symbol: string) {
    return liveIntradayService.isChartCacheFresh(symbol);
  }

  chartNeedsRefresh(asset: AssetRow, minAgeMs = chartConfigService.getIntradayRefreshIntervalMs(), now = new Date()) {
    return liveIntradayService.chartNeedsRefresh(asset, minAgeMs, now);
  }

  getChartData(symbol: string, range: RangeKey, options: ChartDataOptions = {}) {
    return chartDataQueryService.getChartData(symbol, range, options, (assetSymbol) => this.ensureAssetInitialized(assetSymbol));
  }

  getPreviousClosePrice(asset: AssetRow) {
    return chartDataQueryService.getPreviousClosePrice(asset);
  }
}

export const marketDataService = new MarketDataService();
