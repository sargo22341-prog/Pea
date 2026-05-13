import { db } from "../../../db.js";
import { candleRepository } from "../../../repositories/candles/candle.repository.js";
import type { AssetRow } from "../../../repositories/market/asset.repository.js";
import { candleBuilder } from "../../candles/candle.builder.js";
import { logger } from "../../shared/logger.service.js";
import { getLastTradingDay, getMarketDateKey } from "../calendars/marketCalendar.service.js";
import { chartConfigService, type StoredChartRange } from "../charts/chart-config.service.js";
import { filterRangePoints, intervalDurationMs, openMarketWindow } from "../charts/market-chart.helpers.js";

export class StoredRangeRebuilderService {
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

  rebuildFromFinalData(
    asset: AssetRow,
    ranges: StoredChartRange[] = ["1w", "1m", "all"],
    options: { tradingDate?: string; closeIso?: string; closePrice?: number } = {}
  ) {
    let updated = 0;
    const uniqueRanges = [...new Set(ranges)];
    const sourcePoints = candleRepository.readCandles(asset.id, "1d", chartConfigService.getIntervalForRange("1d"));

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
}

export const storedRangeRebuilderService = new StoredRangeRebuilderService();
