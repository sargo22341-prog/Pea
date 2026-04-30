/**
 * Role du fichier : planifier les mises a jour marche non utilisateur.
 * - post-close: un dernier refresh snapshots + candles apres fermeture
 * - weekly: profils/financials/dividendes, donnees lentes et nullables
 */

import { getLastTradingDay, isMarketOpen } from "../marketCalendar.service.js";
import { logger } from "../logger.service.js";
import { assetRepository } from "./asset.repository.js";
import { financialsService } from "./financials.service.js";
import { dividendsService } from "./dividends.service.js";
import { dataConstructionQueue } from "./data-construction-queue.service.js";
import { candleRepository } from "../candles/candle.repository.js";

const postCloseDelayMs = 20 * 60 * 1000;
const fallbackIntervalMs = 10 * 60 * 1000;

function parisClock(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: Number(value("hour")) * 60 + Number(value("minute"))
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
    const paris = parisClock(now);
    if (paris.minutes >= 17 * 60 + 40 && this.lastCronDate !== paris.date) {
      this.lastCronDate = paris.date;
      this.enqueuePostCloseFinalization("cron-17:40-europe-paris");
    }

    if (now.getTime() - this.lastFallbackAt > fallbackIntervalMs) {
      this.lastFallbackAt = now.getTime();
      this.enqueuePostCloseFinalization("fallback");
    }

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
    logger.info("market-data", "post-market finalization enqueue", { symbol: symbol ?? "all" });
    const assets = symbol ? assetRepository.findBySymbol(symbol) ? [assetRepository.findBySymbol(symbol)!] : [] : assetRepository.listTrackedAssets();
    const symbols = assets
      .filter((asset) => {
        const session = getLastTradingDay(asset.symbol, asset.exchange);
        return !candleRepository.isFinalized(asset.id, session.date, "1d");
      })
      .map((asset) => asset.symbol);
    return dataConstructionQueue.enqueuePostCloseFinalization(symbols);
  }

  private enqueuePostCloseFinalization(reason: string) {
    const candidates = assetRepository.listTrackedAssets().filter((asset) => {
      const session = getLastTradingDay(asset.symbol, asset.exchange);
      return !isMarketOpen(asset.symbol, asset.exchange) && Date.now() >= session.period2.getTime() && !candleRepository.isFinalized(asset.id, session.date, "1d");
    });
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
