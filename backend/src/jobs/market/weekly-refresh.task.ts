import { config } from "../../config.js";
import { assetRepository } from "../../repositories/market/asset.repository.js";
import { schedulerRunRepository } from "../../repositories/market/scheduler-run.repository.js";
import { dataConstructionQueue } from "../../services/market/construction/data-construction-queue.service.js";
import { logger } from "../../services/shared/logger.service.js";
import { getZonedDateParts } from "../../services/timezone/date-time.service.js";

const calendarEventsTaskKey = "weekly-calendar-events";
const calendarEventsTargetMinutes = 8 * 60;

function appClock(date: Date) {
  const parts = getZonedDateParts(date, config.appTimezone);
  return {
    date: parts.isoDate,
    minutes: parts.hour * 60 + parts.minute,
    weekday: parts.weekday
  };
}

export class WeeklyRefreshTask {
  async run(now = new Date()) {
    const appTime = appClock(now);
    if (appTime.weekday !== "Mon" || appTime.minutes < calendarEventsTargetMinutes) return;
    if (schedulerRunRepository.wasRun(calendarEventsTaskKey, appTime.date)) {
      logger.debug("market-data", "weekly refresh skipped", { cause: "already-run-today", runDate: appTime.date });
      return;
    }

    const symbols = assetRepository.listTrackedSymbols();
    const job = dataConstructionQueue.enqueueForSymbols("calendar-events", symbols);
    dataConstructionQueue.enqueueForSymbols("dividends", symbols);
    schedulerRunRepository.markRun(calendarEventsTaskKey, appTime.date, "cron-monday-08:00", job.id);
    logger.info("market-data", "weekly refresh scheduled", { assets: symbols.length, jobId: job.id, timezone: config.appTimezone });
  }
}

export const weeklyRefreshTask = new WeeklyRefreshTask();
