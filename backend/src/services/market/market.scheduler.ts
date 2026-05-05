/**
 * Role du fichier : planifier les mises a jour marche non utilisateur.
 * - post-close: un dernier refresh snapshots + candles apres fermeture
 * - weekly: profils/financials/dividendes, donnees lentes et nullables
 */

import { getLastTradingDay, isMarketOpen } from "./marketCalendar.service.js";
import { marketOpenScheduler } from "./market-open.scheduler.js";
import { config } from "../../config.js";
import { logger } from "../shared/logger.service.js";
import { assetRepository } from "./asset.repository.js";
import { financialsService } from "./financials.service.js";
import { dividendsService } from "./dividends.service.js";
import { dataConstructionQueue } from "./data-construction-queue.service.js";
import { candleRepository } from "../candles/candle.repository.js";
import { getZonedDateParts } from "../timezone/date-time.service.js";

/** Vrai si les 4 ranges sont deja finalisees pour ce jour de trading. */
function allRangesFinalized(assetId: number, tradingDate: string) {
  return (["1d", "1w", "1m", "all"] as const).every((range) => candleRepository.isFinalized(assetId, tradingDate, range));
}
import { marketSnapshotService } from "./market-snapshot.service.js";
import { db } from "../../db.js";

const postCloseDelayMs = 20 * 60 * 1000;
const postCloseTargetMinutes = 19 * 60;
const postCloseFinalizationTaskKey = "post-close-finalization";

const calendarEventsTaskKey = "weekly-calendar-events";
const calendarEventsTargetMinutes = 8 * 60; // 08:00 dans le timezone applicatif

/** Lit l'heure de pilotage applicative sans changer les instants UTC stockes. */
function appClock(date: Date) {
  const parts = getZonedDateParts(date, config.appTimezone);
  return {
    date: parts.isoDate,
    minutes: parts.hour * 60 + parts.minute,
    weekday: parts.weekday
  };
}

function wasSchedulerTaskRunToday(taskKey: string, runDate: string) {
  const row = db
    .prepare("SELECT id FROM scheduler_runs WHERE task_key = ? AND run_date = ?")
    .get(taskKey, runDate) as { id?: number } | undefined;
  return Boolean(row?.id);
}

function markSchedulerTaskRun(taskKey: string, runDate: string, reason: string, jobId?: string) {
  db.prepare(
    `INSERT OR IGNORE INTO scheduler_runs (task_key, run_date, reason, job_id)
     VALUES (?, ?, ?, ?)`
  ).run(taskKey, runDate, reason, jobId ?? null);
}

export class MarketScheduler {
  private timer?: NodeJS.Timeout;
  private lastOpenSymbols = new Set<string>();
  private lastCronDate?: string;
  private lastCalendarEventsDate?: string;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 60 * 1000);
    void this.tick();
    marketOpenScheduler.start();
    logger.info("market-data", "post-close scheduler started", {
      timezone: config.appTimezone,
      target: "19:00"
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    marketOpenScheduler.stop();
  }

  async tick(now = new Date()) {
    const appTime = appClock(now);

    // Tous les lundis a 08:00 : refresh des evenements calendrier pour tous les assets.
    if (appTime.weekday === "Mon" && appTime.minutes >= calendarEventsTargetMinutes && this.lastCalendarEventsDate !== appTime.date) {
      this.lastCalendarEventsDate = appTime.date;
      if (wasSchedulerTaskRunToday(calendarEventsTaskKey, appTime.date)) {
        logger.info("market-data", "calendar-events refresh skipped", { cause: "already-run-today", runDate: appTime.date });
      } else {
        const symbols = assetRepository.listTrackedSymbols();
        const job = dataConstructionQueue.enqueueForSymbols("calendar-events", symbols);
        dataConstructionQueue.enqueueForSymbols("dividends", symbols);
        markSchedulerTaskRun(calendarEventsTaskKey, appTime.date, "cron-monday-08:00", job.id);
        logger.info("market-data", "weekly refresh scheduled", { assets: symbols.length, jobId: job.id });
      }
    }

    // Une seule tentative par jour apres 19:00 dans le timezone applicatif.
    if (appTime.minutes >= postCloseTargetMinutes && this.lastCronDate !== appTime.date) {
      this.lastCronDate = appTime.date;
      if (wasSchedulerTaskRunToday(postCloseFinalizationTaskKey, appTime.date)) {
        logger.info("market-data", "post-close finalization skipped", {
          reason: `cron-19:00-${config.appTimezone}`,
          cause: "already-run-today",
          runDate: appTime.date
        });
      } else {
        void this.enqueuePostCloseFinalization(`cron-19:00-${config.appTimezone}`, appTime.date, now);
      }
    }

    for (const asset of assetRepository.listTrackedAssets()) {
      const quote = await marketSnapshotService.getQuote(asset.symbol).catch(() => undefined);
      const open = isMarketOpen(quote?.marketState);
      const wasOpen = this.lastOpenSymbols.has(asset.symbol);

      if (open) this.lastOpenSymbols.add(asset.symbol);

      if (!open && wasOpen) {
        this.lastOpenSymbols.delete(asset.symbol);

        // On garde seulement la detection de fermeture pour log/debug.
        // La finalisation globale reste pilotee uniquement par le cron 19:00.
        const session = getLastTradingDay(asset.symbol, asset.exchange, now);
        const plannedAt = new Date(session.period2.getTime() + postCloseDelayMs);
        logger.debug("market-data", "market closed detected, waiting for daily post-close scheduler", {
          symbol: asset.symbol,
          plannedEarliestPostClose: plannedAt.toISOString()
        });
      }
    }
  }

  async runPostMarketTask(symbol?: string) {
    logger.info("market-data", "post-market finalization enqueue", { symbol: symbol ?? "all" });
    const assets = symbol ? assetRepository.findBySymbol(symbol) ? [assetRepository.findBySymbol(symbol)!] : [] : assetRepository.listTrackedAssets();
    const symbols: string[] = [];
    for (const asset of assets) {
      const session = getLastTradingDay(asset.symbol, asset.exchange);
      if (!allRangesFinalized(asset.id, session.date)) symbols.push(asset.symbol);
    }
    return dataConstructionQueue.enqueuePostCloseFinalization(symbols);
  }

  private async enqueuePostCloseFinalization(reason: string, runDate: string, now = new Date()) {
    const candidates = [];
    for (const asset of assetRepository.listTrackedAssets()) {
      const quote = await marketSnapshotService.getQuote(asset.symbol).catch(() => undefined);
      const session = getLastTradingDay(asset.symbol, asset.exchange, now);
      if (!isMarketOpen(quote?.marketState) && now.getTime() >= session.period2.getTime() && !allRangesFinalized(asset.id, session.date)) candidates.push(asset);
    }
    if (!candidates.length) {
      logger.info("market-data", "post-close finalization skipped", { reason, cause: "no-candidates" });
      return;
    }
    const job = dataConstructionQueue.enqueuePostCloseFinalization(candidates.map((asset) => asset.symbol));
    markSchedulerTaskRun(postCloseFinalizationTaskKey, runDate, reason, job.id);
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
