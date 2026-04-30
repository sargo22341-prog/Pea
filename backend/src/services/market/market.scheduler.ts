/**
 * Role du fichier : planifier les mises a jour marche non utilisateur.
 * - post-close: un dernier refresh snapshots + candles apres fermeture
 * - weekly: profils/financials/dividendes, donnees lentes et nullables
 */

import { getLastTradingDay, isMarketOpen } from "../marketCalendar.service.js";
import { logger } from "../logger.service.js";
import { assetRepository } from "./asset.repository.js";
import { marketDataService } from "./market-data.service.js";
import { marketSnapshotService } from "./market-snapshot.service.js";
import { financialsService } from "./financials.service.js";
import { dividendsService } from "./dividends.service.js";

const postCloseDelayMs = 20 * 60 * 1000;

export class MarketScheduler {
  private timer?: NodeJS.Timeout;
  private lastOpenSymbols = new Set<string>();

  start() {
    this.timer = setInterval(() => void this.tick(), 60 * 1000);
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()) {
    for (const asset of assetRepository.listTrackedAssets()) {
      const open = isMarketOpen(asset.symbol, asset.exchange, now);
      const wasOpen = this.lastOpenSymbols.has(asset.symbol);
      if (open) this.lastOpenSymbols.add(asset.symbol);
      if (!open && wasOpen) {
        this.lastOpenSymbols.delete(asset.symbol);
        const session = getLastTradingDay(asset.symbol, asset.exchange, now);
        const delay = Math.max(postCloseDelayMs, session.period2.getTime() + postCloseDelayMs - Date.now());
        setTimeout(() => void this.runPostMarketTask(asset.symbol), delay);
      }
    }
  }

  async runPostMarketTask(symbol?: string) {
    logger.info("market-data", "post-market refresh start", { symbol: symbol ?? "all" });
    const assets = symbol ? assetRepository.findBySymbol(symbol) ? [assetRepository.findBySymbol(symbol)!] : [] : assetRepository.listTrackedAssets();
    for (const asset of assets) {
      await marketSnapshotService.refreshMarketSnapshot(asset);
      await marketDataService.refreshCandlesForAsset(asset);
    }
    logger.info("market-data", "post-market refresh done", { count: assets.length });
  }

  async runWeeklyFinancialsTask() {
    return financialsService.refreshAllTracked();
  }

  async runWeeklyDividendsTask() {
    return dividendsService.refreshAllTracked();
  }
}

export const marketScheduler = new MarketScheduler();
