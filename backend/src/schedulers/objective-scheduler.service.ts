import { objectiveProjectionRefreshTask } from "../jobs/objectives/objective-projection-refresh.task.js";
import { logger } from "../services/shared/logger.service.js";

const tickIntervalMs = 5 * 60 * 1000;

export class ObjectiveSchedulerService {
  private timer?: NodeJS.Timeout | undefined;
  private inFlightTick?: Promise<void> | undefined;
  private lastRunDate?: string | undefined;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runTick(), tickIntervalMs);
    void this.runTick();
    logger.info("portfolio", "objective scheduler started", { runHour: 23, intervalMs: tickIntervalMs });
  }

  /** Arrête le planificateur et attend la fin du tick en cours, qui libère ses ressources. */
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.inFlightTick;
  }

  private runTick() {
    this.inFlightTick ??= this.tick().finally(() => { this.inFlightTick = undefined; });
    return this.inFlightTick;
  }

  async tick(now = new Date()) {
    const runDate = now.toISOString().slice(0, 10);
    if (now.getHours() !== 23 || this.lastRunDate === runDate) return;
    this.lastRunDate = runDate;
    // Tick lancé sans attente par setInterval : un rejet non géré arrêterait le processus.
    try {
      await objectiveProjectionRefreshTask.run(now);
    } catch (error) {
      logger.error("portfolio", "daily objective projection refresh failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

export const objectiveScheduler = new ObjectiveSchedulerService();
