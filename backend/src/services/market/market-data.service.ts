/**
 * Role du fichier : orchestrer l'ajout/rafraichissement d'un asset marche.
 * Les calculs lourds se font ici, pas dans le frontend.
 */

import type { AssetChartDto, HistoryPoint, Quote, RangeKey } from "@pea/shared";
import { config } from "../../config.js";
import { chartConfigService, normalizeStoredRange, type ChartInterval, type StoredChartRange } from "./chart-config.service.js";
import { getLastAvailableTradingDayFromYahoo, getLastTradingDay, getMarketDateKey, getMarketSessionInfo, getPreviousOpenMarketDays, isMarketOpen, type OpenMarketDay, type YahooTradingDay } from "./marketCalendar.service.js";
import { logger } from "../shared/logger.service.js";
import { db } from "../../db.js";
import { yahooApi } from "../yahoo/yahoo.api.js";
import { pruneIntradayCache } from "../yahoo/cache/history.cache.js";
import { candleBuilder } from "../candles/candle.builder.js";
import { candleRepository } from "../candles/candle.repository.js";
import { assetRepository, type AssetRow } from "./asset.repository.js";
import { marketSnapshotService } from "./market-snapshot.service.js";
import { financialsService } from "./financials.service.js";
import { dividendsService } from "./dividends.service.js";
import { dataConstructionQueue } from "./data-construction-queue.service.js";

const storedConstructionRanges: StoredChartRange[] = ["1d", "1w", "1m", "all"];
const openMarketDayCountByRange: Partial<Record<RangeKey | StoredChartRange, number>> = {
  "1d": 1,
  "1w": 7,
  "1m": 30
};
const INTRADAY_CANDLE_RETENTION_OPEN_DAYS = 30;
type ClosePointSource = "snapshot_close" | "yahoo_daily_fallback_close";
export interface ChartDataOptions {
  forceIntradayOpen?: boolean;
  intradayNow?: Date;
}
const intradayChartCache = new Map<string, { chart: AssetChartDto; expiresAt: number }>();
const intradayRefreshInFlight = new Map<string, Promise<{ updated: number; yahooCalls: number }>>();

function intradayCacheKey(symbol: string, interval: ChartInterval, options: ChartDataOptions) {
  const forcedAt = options.forceIntradayOpen ? options.intradayNow?.toISOString() ?? "forced-open" : "live";
  return `${symbol.toUpperCase()}:1d:${interval}:${forcedAt}`;
}

function cloneChartDto(chart: AssetChartDto): AssetChartDto {
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

function storedDailyPointForTradingDay(asset: AssetRow, tradingDay: YahooTradingDay): HistoryPoint | undefined {
  const rows = candleRepository.readCandles(asset.id, "all", chartConfigService.getIntervalForRange("all"));
  return [...rows].reverse().find((point) => getMarketDateKey(asset.symbol, asset.exchange, new Date(point.date)) === tradingDay.date && Number.isFinite(point.close));
}

function fallbackClosePoint(tradingDay: YahooTradingDay): HistoryPoint {
  return {
    date: tradingDay.period2.toISOString(),
    open: tradingDay.close,
    high: tradingDay.close,
    low: tradingDay.close,
    close: tradingDay.close
  };
}

function snapshotLastPrice(assetId: number) {
  const row = db.prepare("SELECT last_price FROM asset_market_snapshots WHERE asset_id = ?").get(assetId) as { last_price?: number } | undefined;
  const price = Number(row?.last_price);
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

function snapshotPreviousClose(assetId: number) {
  const row = db.prepare("SELECT previous_close FROM asset_market_snapshots WHERE asset_id = ?").get(assetId) as { previous_close?: number } | undefined;
  const price = Number(row?.previous_close);
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

function latestIntradayUpdatedAt(assetId: number) {
  const row = db.prepare("SELECT MAX(datetime_start) AS datetime_start FROM chart_candles_1d WHERE asset_id = ?").get(assetId) as
    | { datetime_start?: string | null }
    | undefined;
  const time = row?.datetime_start ? new Date(row.datetime_start).getTime() : NaN;
  return Number.isFinite(time) ? time : undefined;
}

function validQuotePrice(quote?: Quote) {
  const price = Number(quote?.price);
  return Number.isFinite(price) && price > 0 ? price : undefined;
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

  /**
   * Choisit le prix final de cloture pour materialiser le point de fin 1d.
   * Priorite: snapshot persiste, prix quote Yahoo deja lu, puis daily Yahoo.
   */
  private closePriceForFinalization(asset: AssetRow, quote?: Quote, yahooTradingDay?: YahooTradingDay): { price?: number; source?: ClosePointSource } {
    const snapshotPrice = snapshotLastPrice(asset.id);
    if (snapshotPrice) return { price: snapshotPrice, source: "snapshot_close" };
    const quotePrice = validQuotePrice(quote);
    if (quotePrice) return { price: quotePrice, source: "snapshot_close" };
    const dailyPrice = Number(yahooTradingDay?.close);
    if (Number.isFinite(dailyPrice) && dailyPrice > 0) return { price: dailyPrice, source: "yahoo_daily_fallback_close" };
    return {};
  }

  /**
   * Ajoute ou remplace le point exact de cloture 1d, puis marque la seance
   * finalisee. L'upsert SQL rend l'operation idempotente.
   */
  private async finalizeClosedOneDayCandles(input: {
    asset: AssetRow;
    session: OpenMarketDay;
    quote?: Quote;
    yahooTradingDay?: YahooTradingDay;
    rebuildContext: "forced-rebuild" | "post-close";
  }) {
    const { asset, session, quote, yahooTradingDay, rebuildContext } = input;
    if (isMarketOpen(quote?.marketState)) return { skipped: true, reason: "market-open" };

    const interval = chartConfigService.getIntervalForRange("1d");
    const existing = candleRepository.readCandles(asset.id, "1d", interval);
    const closeIso = session.period2.toISOString();
    const lastPoint = existing[existing.length - 1];
    const lastPointTime = lastPoint ? new Date(lastPoint.date).getTime() : undefined;
    const closeTime = session.period2.getTime();
    const existingClosePoint = existing.find((point) => new Date(point.date).getTime() === closeTime);
    if (!existingClosePoint && (!Number.isFinite(lastPointTime) || Number(lastPointTime) < closeTime)) {
      logger.info("market-data", "close point missing", {
        symbol: asset.symbol,
        tradingDate: session.date,
        lastPoint: pointLabel(lastPoint),
        marketCloseTime: closeIso,
        context: rebuildContext
      });
    }

    const close = this.closePriceForFinalization(asset, quote, yahooTradingDay);
    logger.info("market-data", "close source used", {
      symbol: asset.symbol,
      tradingDate: session.date,
      source: close.source,
      hasClosePrice: Number.isFinite(close.price)
    });
    if (!close.price || !close.source) return { skipped: true, reason: "missing-close-price" };

    const previous = [...existing].reverse().find((point) => new Date(point.date).getTime() < closeTime);
    const previousClose = previous?.close ?? close.price;
    candleRepository.upsertCandles([
      {
        assetId: asset.id,
        range: "1d",
        interval,
        datetimeStart: closeIso,
        datetimeEnd: new Date(closeTime + intervalDurationMs(interval)).toISOString(),
        open: previousClose,
        high: Math.max(previousClose, close.price),
        low: Math.min(previousClose, close.price),
        close: close.price,
        volume: null,
        source: close.source
      }
    ]);

    // Garde-fou : verifie que le point est bien present en DB avant d'ecrire le flag.
    const verifiedPoints = candleRepository.readCandles(asset.id, "1d", interval);
    const pointWritten = verifiedPoints.some((p) => p.date === closeIso && Number.isFinite(p.close) && p.close > 0);
    if (!pointWritten) {
      logger.error("market-data", "finalization skipped because chart missing", {
        symbol: asset.symbol,
        tradingDate: session.date,
        marketCloseTime: closeIso,
        context: rebuildContext
      });
      return { skipped: true, reason: "chart-candle-missing" };
    }

    logger.info("market-data", "chart candles updated", {
      symbol: asset.symbol,
      tradingDate: session.date,
      marketCloseTime: closeIso,
      closePrice: close.price,
      source: close.source,
      action: existingClosePoint ? "replaced" : "appended",
      context: rebuildContext
    });

    candleRepository.markFinalized(asset.id, session.date, "1d");
    logger.info("market-data", "finalization written after chart update", { symbol: asset.symbol, tradingDate: session.date, range: "1d", context: rebuildContext });
    return { skipped: false, finalized: true, closeIso, closePrice: close.price };
  }

  /**
   * Charge l'intraday complet d'une derniere seance fermee trouvee via Yahoo
   * daily. Le daily ne sert ici qu'a resoudre la date et le close de reference.
   */
  private async fetchClosedIntradaySession(input: {
    asset: AssetRow;
    tradingDay: YahooTradingDay;
    quote?: Quote;
    persist?: boolean;
  }) {
    const { asset, tradingDay, quote, persist = false } = input;
    const interval = chartConfigService.getIntervalForRange("1d");
    const period2 = new Date(tradingDay.period2.getTime() + intervalDurationMs(interval));
    const chart = await yahooApi.chart(asset.symbol, {
      period1: tradingDay.period1,
      period2,
      interval: yahooInterval(interval)
    });
    let points = validateChartPoints({
      symbol: asset.symbol,
      range: "1d",
      points: chart.quotes,
      marketCloseTime: tradingDay.period2
    });
    const close = this.closePriceForFinalization(asset, quote, tradingDay);
    const closeTime = tradingDay.period2.getTime();
    const lastTime = points.length ? new Date(points[points.length - 1].date).getTime() : undefined;
    const hasClosePoint = points.some((point) => new Date(point.date).getTime() === closeTime);

    if (close.price && (!hasClosePoint || Number(lastTime) < closeTime)) {
      points = points.filter((point) => new Date(point.date).getTime() !== closeTime);
      points.push({
        date: tradingDay.period2.toISOString(),
        open: points[points.length - 1]?.close ?? close.price,
        high: Math.max(points[points.length - 1]?.close ?? close.price, close.price),
        low: Math.min(points[points.length - 1]?.close ?? close.price, close.price),
        close: close.price
      });
      points.sort((a, b) => a.date.localeCompare(b.date));
      logger.info("market-data", hasClosePoint ? "close point replaced" : "close point appended", {
        symbol: asset.symbol,
        tradingDate: tradingDay.date,
        marketCloseTime: tradingDay.period2.toISOString(),
        closePrice: close.price,
        source: close.source,
        context: "closed-intraday-session"
      });
    }

    if (points.length === 0) points = [storedDailyPointForTradingDay(asset, tradingDay) ?? fallbackClosePoint(tradingDay)];

    if (persist) {
      const candles = candleBuilder.buildCandles({
        assetId: asset.id,
        symbol: asset.symbol,
        exchange: asset.exchange,
        range: "1d",
        interval,
        points
      });
      candleRepository.upsertCandles(candles);
      await this.finalizeClosedOneDayCandles({
        asset,
        session: tradingDay,
        quote,
        yahooTradingDay: tradingDay,
        rebuildContext: "forced-rebuild"
      });
    }

    logger.info("market-data", "closed intraday session resolved", {
      symbol: asset.symbol,
      tradingDate: tradingDay.date,
      yahooPoints: chart.quotes.length,
      fallbackPoints: points.length,
      marketCloseTime: tradingDay.period2.toISOString()
    });
    return points;
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
      const chart = await yahooApi.chart(asset.symbol, { ...periodWithInclusiveClose, interval: yahooInterval(interval) });
      let validatedPoints = validateChartPoints({
        symbol: asset.symbol,
        range,
        points: chart.quotes,
        marketCloseTime: session?.period2
      });
      if (range === "1d" && validatedPoints.length === 0) {
        latestYahooTradingDay = latestYahooTradingDay ?? (await getLastAvailableTradingDayFromYahoo(asset.symbol, new Date(), asset.exchange).catch(() => undefined));
        validatedPoints = latestYahooTradingDay
          ? await this.fetchClosedIntradaySession({ asset, tradingDay: latestYahooTradingDay, quote, persist: false })
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
        await this.finalizeClosedOneDayCandles({
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
    const chart = await yahooApi.chart(asset.symbol, {
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

    const finalized = await this.finalizeClosedOneDayCandles({
      asset,
      session,
      quote,
      yahooTradingDay,
      rebuildContext: "post-close"
    });

    // Important: cette methode ne reconstruit plus 1w/1m/all.
    // La queue post-close fait ensuite:
    // FINALIZE:1D -> REBUILD-STORED:1W -> REBUILD-STORED:1M -> REBUILD-STORED:ALL.
    return finalized;
  }

  private resolveFinalCloseFromStoredOneDay(asset: AssetRow, tradingDate?: string) {
    const interval = chartConfigService.getIntervalForRange("1d");
    const oneDayPoints = candleRepository.readCandles(asset.id, "1d", interval);
    const targetTradingDate = tradingDate ?? candleRepository.latestFinalizedTradingDate(asset.id, "1d");
    const candidates = targetTradingDate
      ? oneDayPoints.filter((point) => getMarketDateKey(asset.symbol, asset.exchange, new Date(point.date)) === targetTradingDate)
      : oneDayPoints;
    const closePoint = [...candidates].reverse().find((point) => Number.isFinite(point.close) && point.close > 0);
    if (!closePoint) return undefined;
    return {
      tradingDate: targetTradingDate ?? getMarketDateKey(asset.symbol, asset.exchange, new Date(closePoint.date)),
      closeIso: closePoint.date,
      closePrice: closePoint.close
    };
  }

  async rebuildStoredRangesFromFinalData(
    asset: AssetRow,
    ranges: StoredChartRange[] = ["1w", "1m", "all"],
    options: { tradingDate?: string; closeIso?: string; closePrice?: number } = {}
  ) {
    let updated = 0;
    const uniqueRanges = [...new Set(ranges)];
    const sourcePoints = candleRepository.readCandles(asset.id, "1d", chartConfigService.getIntervalForRange("1d"));

    // Si sourcePoints est vide, rien a reconstruire.
    if (!sourcePoints.length) {
      logger.warn("market-data", "finalization skipped because chart missing", {
        symbol: asset.symbol,
        reason: "no-1d-candles",
        requestedRanges: uniqueRanges
      });
      return { updated: 0 };
    }

    const resolvedClose =
      options.closeIso && Number.isFinite(options.closePrice)
        ? { tradingDate: options.tradingDate, closeIso: options.closeIso, closePrice: Number(options.closePrice) }
        : this.resolveFinalCloseFromStoredOneDay(asset, options.tradingDate);
    const endDate = resolvedClose?.closeIso ? new Date(resolvedClose.closeIso) : new Date();

    for (const range of uniqueRanges) {
      if (range === "all") {
        if (!resolvedClose?.closeIso || !Number.isFinite(resolvedClose.closePrice)) {
          logger.warn("market-data", "all rebuild skipped: no finalized close point found", {
            symbol: asset.symbol,
            tradingDate: options.tradingDate
          });
          continue;
        }

        const closeDate = new Date(resolvedClose.closeIso);
        const session = getLastTradingDay(asset.symbol, asset.exchange, closeDate);
        db.prepare("DELETE FROM chart_candles_all WHERE asset_id = ? AND interval = '1d' AND datetime_start >= ? AND datetime_start <= ?")
          .run(asset.id, session.period1.toISOString(), session.period2.toISOString());

        const finalClosePrice = Number(resolvedClose.closePrice);
        updated += candleRepository.upsertCandles([
          {
            assetId: asset.id,
            range: "all",
            interval: "1d",
            datetimeStart: resolvedClose.closeIso,
            datetimeEnd: new Date(closeDate.getTime() + intervalDurationMs("1d")).toISOString(),
            open: finalClosePrice,
            high: finalClosePrice,
            low: finalClosePrice,
            close: finalClosePrice,
            volume: null,
            source: "snapshot_close"
          }
        ]);
        logger.info("market-data", "chart candles updated", {
          symbol: asset.symbol,
          range: "all",
          tradingDate: resolvedClose.tradingDate,
          closeIso: resolvedClose.closeIso,
          closePrice: finalClosePrice
        });
        if (resolvedClose.tradingDate) candleRepository.markFinalized(asset.id, resolvedClose.tradingDate, "all");
        logger.info("market-data", "finalization written after chart update", { symbol: asset.symbol, tradingDate: resolvedClose.tradingDate, range: "all" });
        continue;
      }

      if (range !== "1w" && range !== "1m") continue;

      const interval = chartConfigService.getIntervalForRange(range);
      const points = filterRangePoints(sourcePoints, range, asset, endDate);
      const candles = candleBuilder.buildCandles({ assetId: asset.id, symbol: asset.symbol, exchange: asset.exchange, range, interval, points });

      // Mise a jour incrementale: on ajoute/remplace les nouveaux points, puis on prune uniquement les jours trop anciens.
      // Ne pas deleteRange ici, sinon on efface tout l'historique 1w/1m avant de reinserer seulement le dernier intraday.
      updated += candleRepository.upsertCandles(candles.map((candle) => ({ ...candle, source: "stored_final" as const })));
      const window = openMarketWindow(asset, range, endDate);
      if (window) candleRepository.pruneBefore(asset.id, range, interval, window.cutoffIso);
      logger.info("market-data", "chart candles updated", {
        symbol: asset.symbol,
        range,
        interval,
        sourcePoints: sourcePoints.length,
        rangePoints: points.length,
        candles: candles.length,
        tradingDate: resolvedClose?.tradingDate,
        cutoffIso: window?.cutoffIso
      });
      if (resolvedClose?.tradingDate) candleRepository.markFinalized(asset.id, resolvedClose.tradingDate, range);
      logger.info("market-data", "finalization written after chart update", { symbol: asset.symbol, tradingDate: resolvedClose?.tradingDate, range });
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

  async refreshLiveIntradayForAssets(assets: AssetRow[], now = new Date(), options: { minAgeMs?: number; force?: boolean } = {}) {
    let updated = 0;
    let yahooCalls = 0;
    const uniqueAssets = [...new Map(assets.map((asset) => [asset.symbol.toUpperCase(), asset])).values()];
    for (const asset of uniqueAssets) {
      if (!options.force && !this.chartNeedsRefresh(asset, options.minAgeMs ?? chartConfigService.getIntradayRefreshIntervalMs(), now)) continue;
      const result = await this.refreshLiveIntradayForAsset(asset, now);
      updated += result.updated;
      yahooCalls += result.yahooCalls;
    }
    return { updated, yahooCalls };
  }

  refreshLiveIntradayForAsset(asset: AssetRow, now = new Date()) {
    const key = `${asset.symbol.toUpperCase()}:1d`;
    const existing = intradayRefreshInFlight.get(key);
    if (existing) return existing;

    const promise = this.refreshLiveIntradayForAssetNow(asset, now).finally(() => {
      intradayRefreshInFlight.delete(key);
    });
    intradayRefreshInFlight.set(key, promise);
    return promise;
  }

  isIntradayRefreshInFlight(symbol: string) {
    return intradayRefreshInFlight.has(`${symbol.toUpperCase()}:1d`);
  }

  isIntradayChartCacheFresh(symbol: string) {
    const interval = chartConfigService.getIntervalForRange("1d");
    const cacheKey = intradayCacheKey(symbol, interval, {});
    const cached = intradayChartCache.get(cacheKey);
    return Boolean(cached && cached.expiresAt > Date.now());
  }

  chartNeedsRefresh(asset: AssetRow, minAgeMs = chartConfigService.getIntradayRefreshIntervalMs(), now = new Date()) {
    if (this.isIntradayChartCacheFresh(asset.symbol)) return false;
    const lastUpdatedAt = latestIntradayUpdatedAt(asset.id);
    if (!lastUpdatedAt) return true;
    return now.getTime() - lastUpdatedAt > minAgeMs;
  }

  private async refreshLiveIntradayForAssetNow(asset: AssetRow, now = new Date()) {
    const interval = chartConfigService.getIntervalForRange("1d");
    const cacheKey = intradayCacheKey(asset.symbol, interval, {});
    const cached = intradayChartCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return { updated: 0, yahooCalls: 0 };

    const session = getLastTradingDay(asset.symbol, asset.exchange, now);
    const period2 = new Date(Math.min(now.getTime(), session.period2.getTime()) + intervalDurationMs(interval));
    const chart = await yahooApi.chart(asset.symbol, { period1: session.period1, period2, interval: yahooInterval(interval) });
    const points = validateChartPoints({ symbol: asset.symbol, range: "1d", points: chart.quotes, marketCloseTime: session.period2 });
    if (points.length === 0) {
      logger.warn("market-data", "live intraday refresh returned no points; keeping stored chart", { symbol: asset.symbol });
      return { updated: 0, yahooCalls: 1 };
    }
    const candles = candleBuilder.buildCandles({
      assetId: asset.id,
      symbol: asset.symbol,
      exchange: asset.exchange,
      range: "1d",
      interval,
      points
    });
    const updated = candleRepository.upsertCandles(candles);
    const baseline = this.getStoredPreviousClosePrice(asset);
    const payload = compactHistory(asset.symbol, "1d", interval, points, baseline, getMarketSessionInfo(asset.symbol, asset.exchange));
    intradayChartCache.set(cacheKey, { chart: cloneChartDto(payload), expiresAt: Date.now() + chartConfigService.getPortfolioChartRefreshIntervalMs() });
    return { updated, yahooCalls: 1 };
  }

  async getChartData(symbol: string, range: RangeKey, options: ChartDataOptions = {}): Promise<AssetChartDto> {
    const existingAsset = assetRepository.findBySymbol(symbol);
    if (!existingAsset && config.enableMarketLiveRefresh) {
      return compactHistory(symbol.toUpperCase(), range, range === "1d" ? chartConfigService.getIntervalForRange("1d") : chartConfigService.getIntervalForRange(normalizeStoredRange(range)), [], undefined);
    }
    const asset = existingAsset ?? (await this.ensureAssetInitialized(symbol));
    const intradayInterval = range === "1d" ? chartConfigService.getIntervalForRange("1d") : undefined;
    const cacheKey = intradayInterval ? intradayCacheKey(asset.symbol, intradayInterval, options) : undefined;
    const cached = cacheKey ? intradayChartCache.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug("chart", "intraday chart cache hit", { symbol: asset.symbol, cacheKey, ttlMs: cached.expiresAt - Date.now() });
      return cloneChartDto(cached.chart);
    }

    const quote = range === "1d" ? await marketSnapshotService.getQuote(asset.symbol).catch(() => undefined) : undefined;
    const now = options.intradayNow ?? new Date();
    const forceIntradayOpen = range === "1d" && options.forceIntradayOpen;
    if (config.enableMarketLiveRefresh && !forceIntradayOpen) {
      return this.getStoredChartData(asset, range, quote);
    }
    if (range === "1d" && (isMarketOpen(quote?.marketState) || forceIntradayOpen)) {
      const session = getLastTradingDay(asset.symbol, quote?.exchange ?? asset.exchange, now);
      const interval = intradayInterval ?? chartConfigService.getIntervalForRange("1d");
      const period2 = new Date(Math.min(now.getTime(), session.period2.getTime()) + intervalDurationMs(interval));
      const chart = await yahooApi.chart(asset.symbol, { period1: session.period1, period2, interval: yahooInterval(interval) });
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
      if (cacheKey) intradayChartCache.set(cacheKey, { chart: cloneChartDto(payload), expiresAt: Date.now() + intervalDurationMs(interval) });
      return payload;
    }

    const storedRange = normalizeStoredRange(range);
    const interval = chartConfigService.getIntervalForRange(storedRange);
    const rawPoints = candleRepository.readCandles(asset.id, storedRange, interval);
    const points = filterRangePoints(rawPoints, range, asset);
    const latestFinalizedTradingDate = storedRange === "1d" ? candleRepository.latestFinalizedTradingDate(asset.id, "1d") : undefined;

    // Repair rebuild : si le flag finalized existe pour ce range mais que chart_candles est vide ou ne couvre pas
    // la date finalisee, on force un rebuild de reparation plutot que de servir des donnees perimees.
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
        void this.rebuildStoredRangesFromFinalData(asset, [storedRange]);
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
          ? await this.fetchClosedIntradaySession({ asset, tradingDay: yahooTradingDay, quote, persist: true })
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

  /**
   * Lit la baseline precedente sans appel reseau pour les charts deja finalises.
   */
  private getStoredPreviousClosePrice(asset: AssetRow): { price: number; datetime?: string } | undefined {
    const snapshotPrice = snapshotPreviousClose(asset.id);
    if (snapshotPrice) return { price: snapshotPrice };
    const points = candleRepository.readCandles(asset.id, "1w", chartConfigService.getIntervalForRange("1w"));
    const previous = [...points].reverse().find((point) => Number.isFinite(point.close));
    return previous ? { price: previous.close, datetime: previous.date } : undefined;
  }

  private getStoredChartData(asset: AssetRow, range: RangeKey, quote?: Quote): AssetChartDto {
    const storedRange = normalizeStoredRange(range);
    const interval = chartConfigService.getIntervalForRange(storedRange);
    const rawPoints = candleRepository.readCandles(asset.id, storedRange, interval);
    const points = filterRangePoints(rawPoints, range, asset);
    const baseline = storedRange === "1d" ? this.getStoredPreviousClosePrice(asset) : undefined;
    const payload = compactHistory(asset.symbol, storedRange, interval, points, baseline, getMarketSessionInfo(asset.symbol, quote?.exchange ?? asset.exchange));
    if (points.length < 2) {
      if (config.enableMarketLiveRefresh && storedRange === "1d") return payload;
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

export const marketDataService = new MarketDataService();
