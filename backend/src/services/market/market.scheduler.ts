/**
 * Role du fichier : planifier les mises a jour marche non utilisateur.
 * - post-close: un dernier refresh snapshots + candles apres fermeture
 * - weekly: profils/financials/dividendes, donnees lentes et nullables
 */

import { getLastTradingDay, isMarketOpen } from "./marketCalendar.service.js";
import { config } from "../../config.js";
import { logger } from "../shared/logger.service.js";
import { assetRepository } from "./asset.repository.js";
import { financialsService } from "./financials.service.js";
import { dividendsService } from "./dividends.service.js";
import { dataConstructionQueue } from "./data-construction-queue.service.js";
import { candleRepository } from "../candles/candle.repository.js";
import { getZonedDateParts } from "../timezone/date-time.service.js";
import { marketSnapshotService } from "./market-snapshot.service.js";

const postCloseDelayMs = 20 * 60 * 1000;
const fallbackIntervalMs = 10 * 60 * 1000;

/** Lit l'heure de pilotage applicative sans changer les instants UTC stockes. */
function appClock(date: Date) {
  const parts = getZonedDateParts(date, config.appTimezone);
  return {
    date: parts.isoDate,
    minutes: parts.hour * 60 + parts.minute
  };
}

export class MarketScheduler {
  private timer?: NodeJS.Timeout;
  private lastOpenSymbols = new Set<string>();
  private lastCronDate?: string;
  private lastFallbackAt = 0;

  start() {
    this.timer = setInterval(() => void this.tick(), 60 * 1000);
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()) {
    const appTime = appClock(now);
    if (appTime.minutes >= 17 * 60 + 40 && this.lastCronDate !== appTime.date) {
      this.lastCronDate = appTime.date;
      void this.enqueuePostCloseFinalization(`cron-17:40-${config.appTimezone}`);
    }

    if (now.getTime() - this.lastFallbackAt > fallbackIntervalMs) {
      this.lastFallbackAt = now.getTime();
      void this.enqueuePostCloseFinalization("fallback");
    }

    for (const asset of assetRepository.listTrackedAssets()) {
      const quote = await marketSnapshotService.getQuote(asset.symbol).catch(() => undefined);
      const open = isMarketOpen(quote?.marketState);
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
    logger.info("market-data", "post-market finalization enqueue", { symbol: symbol ?? "all" });
    const assets = symbol ? assetRepository.findBySymbol(symbol) ? [assetRepository.findBySymbol(symbol)!] : [] : assetRepository.listTrackedAssets();
    const symbols: string[] = [];
    for (const asset of assets) {
      const session = getLastTradingDay(asset.symbol, asset.exchange);
      if (!candleRepository.isFinalized(asset.id, session.date, "1d")) symbols.push(asset.symbol);
    }
    return dataConstructionQueue.enqueuePostCloseFinalization(symbols);
  }

  private async enqueuePostCloseFinalization(reason: string) {
    const candidates = [];
    for (const asset of assetRepository.listTrackedAssets()) {
      const quote = await marketSnapshotService.getQuote(asset.symbol).catch(() => undefined);
      const session = getLastTradingDay(asset.symbol, asset.exchange);
      if (!isMarketOpen(quote?.marketState) && Date.now() >= session.period2.getTime() && !candleRepository.isFinalized(asset.id, session.date, "1d")) candidates.push(asset);
    }
    if (!candidates.length) return;
    const job = dataConstructionQueue.enqueuePostCloseFinalization(candidates.map((asset) => asset.symbol));
    logger.info("market-data", "post-close finalization scheduled", { reason, assets: candidates.length, jobId: job.id });
  }

  async runWeeklyFinancialsTask() {
    return financialsService.refreshAllTracked();
  }

  async runWeeklyDividendsTask() {
    return dividendsService.refreshAllTracked();
  }
}

export const marketScheduler = new MarketScheduler();
