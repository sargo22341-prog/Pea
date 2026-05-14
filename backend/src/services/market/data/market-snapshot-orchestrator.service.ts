import type { RangeKey } from "@pea/shared";
import { assetRepository, type AssetRow } from "../../../repositories/market/asset.repository.js";
import { logger } from "../../shared/logger.service.js";
import { dividendsService } from "../dividends/dividends.service.js";
import { financialsService } from "../financials/financials.service.js";
import { marketSnapshotService } from "../snapshots/market-snapshot.service.js";
import { type StoredChartRange } from "../charts/chart-config.service.js";
import { type ChartDataOptions } from "../charts/market-chart.helpers.js";
import { assetInitializationService } from "./asset-initialization.service.js";
import { candleRefreshService } from "./candle-refresh.service.js";
import { chartDataQueryService } from "./chart-data-query.service.js";
import { liveChartService } from "./live-chart.service.js";
import { storedRangeRebuilderService } from "./stored-range-rebuilder.service.js";
import { symbolLockService } from "../../shared/symbol-lock.service.js";

export type { ChartDataOptions } from "../charts/market-chart.helpers.js";

/**
 * `MarketSnapshotOrchestrator` (anciennement `MarketDataService`) : orchestre les opérations
 * complètes au niveau d'un asset.
 *
 * Délègue les responsabilités spécialisées à :
 *   - `assetInitializationService` : création initiale de l'asset
 *   - `candleRefreshService` : refresh complet des candles 1d/1w/1m/all
 *   - `candleFinalizationService` : finalisation post-close (via candleRefreshService)
 *   - `liveChartService` : refresh intraday + cache mémoire
 *   - `chartDataQueryService` : lecture chart pour le DTO frontend
 *   - `storedRangeRebuilderService` : reconstruction des ranges depuis 1d
 *   - `marketSnapshotService` / `financialsService` / `dividendsService` : refresh des annexes
 *
 * `MarketDataService` est conservé comme alias historique pour limiter la cascade des imports.
 */
export class MarketSnapshotOrchestrator {
  async ensureAssetInitialized(symbol: string): Promise<AssetRow> {
    return assetInitializationService.ensureAssetInitialized(symbol);
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

  refreshCandlesForAsset(asset: AssetRow, ranges?: StoredChartRange[]) {
    return candleRefreshService.refreshCandlesForAsset(asset, ranges);
  }

  finalizePostCloseForAsset(asset: AssetRow, now = new Date()) {
    return candleRefreshService.finalizePostCloseForAsset(asset, now);
  }

  rebuildStoredRangesFromFinalData(
    asset: AssetRow,
    ranges: StoredChartRange[] = ["1w", "1m", "all"],
    options: { tradingDate?: string; closeIso?: string; closePrice?: number } = {}
  ) {
    return symbolLockService.withLock(`candles:${asset.symbol.toUpperCase()}`, async () =>
      storedRangeRebuilderService.rebuildFromFinalData(asset, ranges, options)
    );
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
    return liveChartService.refreshForAssets(assets, now, options);
  }

  refreshLiveIntradayForAsset(asset: AssetRow, now = new Date()) {
    return liveChartService.refreshForAsset(asset, now);
  }

  isIntradayRefreshInFlight(symbol: string) {
    return liveChartService.isRefreshInFlight(symbol);
  }

  isIntradayChartCacheFresh(symbol: string) {
    return liveChartService.isChartCacheFresh(symbol);
  }

  chartNeedsRefresh(asset: AssetRow, minAgeMs?: number, now = new Date()) {
    return liveChartService.chartNeedsRefresh(asset, minAgeMs, now);
  }

  getChartData(symbol: string, range: RangeKey, options: ChartDataOptions = {}) {
    return chartDataQueryService.getChartData(symbol, range, options, (assetSymbol) => this.ensureAssetInitialized(assetSymbol));
  }

  getPreviousClosePrice(asset: AssetRow) {
    return chartDataQueryService.getPreviousClosePrice(asset);
  }
}

export const marketSnapshotOrchestrator = new MarketSnapshotOrchestrator();
