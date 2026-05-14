import { candleRepository } from "../../../repositories/candles/candle.repository.js";
import type { AssetRow } from "../../../repositories/market/asset.repository.js";
import { candleBuilder } from "../../candles/candle.builder.js";
import { logger } from "../../shared/logger.service.js";
import { symbolLockService } from "../../shared/symbol-lock.service.js";
import { getLastTradingDay, getMarketSessionInfo } from "../calendars/marketCalendar.service.js";
import { chartConfigService } from "../charts/chart-config.service.js";
import {
  compactHistory,
  intradayCacheKey,
  intradayRefreshInFlight,
  intervalDurationMs,
  latestIntradayUpdatedAt,
  readIntradayChartCache,
  snapshotPreviousClose,
  validateChartPoints,
  writeIntradayChartCache,
  yahooInterval
} from "../charts/market-chart.helpers.js";
import { marketDataGateway } from "./market-data-gateway.service.js";

/**
 * `LiveChartService` (anciennement `LiveIntradayService`) : refresh intraday du chart 1d en
 * direct, dédup par symbole via `intradayRefreshInFlight`, sérialisation par lock candles via
 * `symbolLockService`, et cache mémoire `intradayChartCache` pour limiter les appels Yahoo.
 *
 * Ne touche que la range 1d (intraday). Les autres ranges sont reconstruites par
 * `CandleRefreshService` ou `CandleFinalizationService`.
 */
export class LiveChartService {
  async refreshForAssets(assets: AssetRow[], now = new Date(), options: { minAgeMs?: number; force?: boolean } = {}) {
    let updated = 0;
    let yahooCalls = 0;
    const uniqueAssets = [...new Map(assets.map((asset) => [asset.symbol.toUpperCase(), asset])).values()];
    for (const asset of uniqueAssets) {
      if (!options.force && !this.chartNeedsRefresh(asset, options.minAgeMs ?? chartConfigService.getIntradayRefreshIntervalMs(), now)) continue;
      const result = await this.refreshForAsset(asset, now);
      updated += result.updated;
      yahooCalls += result.yahooCalls;
    }
    return { updated, yahooCalls };
  }

  refreshForAsset(asset: AssetRow, now = new Date()) {
    const key = `${asset.symbol.toUpperCase()}:1d`;
    const existing = intradayRefreshInFlight.get(key);
    if (existing) return existing;

    const promise = symbolLockService
      .withLock(`candles:${asset.symbol.toUpperCase()}`, () => this.refreshForAssetNow(asset, now))
      .finally(() => {
        intradayRefreshInFlight.delete(key);
      });
    intradayRefreshInFlight.set(key, promise);
    return promise;
  }

  isRefreshInFlight(symbol: string) {
    return intradayRefreshInFlight.has(`${symbol.toUpperCase()}:1d`);
  }

  isChartCacheFresh(symbol: string) {
    const interval = chartConfigService.getIntervalForRange("1d");
    const cacheKey = intradayCacheKey(symbol, interval, {});
    return Boolean(readIntradayChartCache(cacheKey));
  }

  chartNeedsRefresh(asset: AssetRow, minAgeMs = chartConfigService.getIntradayRefreshIntervalMs(), now = new Date()) {
    if (this.isChartCacheFresh(asset.symbol)) return false;
    const lastUpdatedAt = latestIntradayUpdatedAt(asset.id);
    if (!lastUpdatedAt) return true;
    return now.getTime() - lastUpdatedAt > minAgeMs;
  }

  private refreshForAssetNow = async (asset: AssetRow, now = new Date()) => {
    const interval = chartConfigService.getIntervalForRange("1d");
    const cacheKey = intradayCacheKey(asset.symbol, interval, {});
    if (readIntradayChartCache(cacheKey)) return { updated: 0, yahooCalls: 0 };

    const session = getLastTradingDay(asset.symbol, asset.exchange, now);
    const period2 = new Date(Math.min(now.getTime(), session.period2.getTime()) + intervalDurationMs(interval));
    const chart = await marketDataGateway.fetchFreshChart(asset.symbol, { period1: session.period1, period2, interval: yahooInterval(interval) });
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
    writeIntradayChartCache(cacheKey, payload, Date.now() + intervalDurationMs(interval));
    return { updated, yahooCalls: 1 };
  };

  private getStoredPreviousClosePrice(asset: AssetRow): { price: number; datetime?: string } | undefined {
    const snapshotPrice = snapshotPreviousClose(asset.id);
    if (snapshotPrice) return { price: snapshotPrice };
    const points = candleRepository.readCandles(asset.id, "1w", chartConfigService.getIntervalForRange("1w"));
    const previous = [...points].reverse().find((point) => Number.isFinite(point.close));
    return previous ? { price: previous.close, datetime: previous.date } : undefined;
  }
}

export const liveChartService = new LiveChartService();
