import type { HistoryPoint, Quote } from "@pea/shared";
import { candleRepository } from "../../../repositories/candles/candle.repository.js";
import type { AssetRow } from "../../../repositories/market/asset.repository.js";
import { candleBuilder } from "../../candles/candle.builder.js";
import { logger } from "../../shared/logger.service.js";
import { chartConfigService } from "../charts/chart-config.service.js";
import {
  fallbackClosePoint,
  intervalDurationMs,
  pointLabel,
  snapshotLastPrice,
  storedDailyPointForTradingDay,
  validQuotePrice,
  validateChartPoints,
  yahooInterval,
  type ClosePointSource
} from "../charts/market-chart.helpers.js";
import { isMarketOpen, type OpenMarketDay, type YahooTradingDay } from "../calendars/marketCalendar.service.js";
import { marketDataGateway } from "./market-data-gateway.service.js";

export class PostCloseFinalizationService {
  closePriceForFinalization(asset: AssetRow, quote?: Quote, yahooTradingDay?: YahooTradingDay): { price?: number; source?: ClosePointSource } {
    const snapshotPrice = snapshotLastPrice(asset.id);
    if (snapshotPrice) return { price: snapshotPrice, source: "snapshot_close" };
    const quotePrice = validQuotePrice(quote);
    if (quotePrice) return { price: quotePrice, source: "snapshot_close" };
    const dailyPrice = Number(yahooTradingDay?.close);
    if (Number.isFinite(dailyPrice) && dailyPrice > 0) return { price: dailyPrice, source: "yahoo_daily_fallback_close" };
    return {};
  }

  async finalizeClosedOneDayCandles(input: {
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

  async fetchClosedIntradaySession(input: {
    asset: AssetRow;
    tradingDay: YahooTradingDay;
    quote?: Quote;
    persist?: boolean;
  }): Promise<HistoryPoint[]> {
    const { asset, tradingDay, quote, persist = false } = input;
    const interval = chartConfigService.getIntervalForRange("1d");
    const period2 = new Date(tradingDay.period2.getTime() + intervalDurationMs(interval));
    const chart = await marketDataGateway.fetchFreshChart(asset.symbol, {
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
}

export const postCloseFinalizationService = new PostCloseFinalizationService();
