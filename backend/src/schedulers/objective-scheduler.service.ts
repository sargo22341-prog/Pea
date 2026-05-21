import { objectiveProjectionRefreshTask } from "../jobs/objectives/objective-projection-refresh.task.js";
import { logger } from "../services/shared/logger.service.js";

const tickIntervalMs = 5 * 60 * 1000;

export class ObjectiveSchedulerService {
  private timer?: NodeJS.Timeout;
  private lastRunDate?: string;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), tickIntervalMs);
    void this.tick();
    logger.info("portfolio", "objective scheduler started", { runHour: 23, intervalMs: tickIntervalMs });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(now = new Date()) {
    const runDate = now.toISOString().slice(0, 10);
    if (now.getHours() !== 23 || this.lastRunDate === runDate) return;
    this.lastRunDate = runDate;
    await objectiveProjectionRefreshTask.run(now);
  }
}

export const objectiveScheduler = new ObjectiveSchedulerService();
