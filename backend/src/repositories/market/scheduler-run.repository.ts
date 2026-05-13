import { db } from "../../db.js";

export class SchedulerRunRepository {
  wasRun(taskKey: string, runDate: string) {
    const row = db.prepare("SELECT id FROM scheduler_runs WHERE task_key = ? AND run_date = ?").get(taskKey, runDate) as { id?: number } | undefined;
    return Boolean(row?.id);
  }

  markRun(taskKey: string, runDate: string, reason: string, jobId?: string) {
    db.prepare(
      `INSERT OR IGNORE INTO scheduler_runs (task_key, run_date, reason, job_id)
       VALUES (?, ?, ?, ?)`
    ).run(taskKey, runDate, reason, jobId ?? null);
  }
}

export const schedulerRunRepository = new SchedulerRunRepository();
