import { db } from "../../db.js";
import { nowIso } from "../../schedulers/market-task.utils.js";

export interface SchedulerHealthRow {
  scheduler_name: string;
  last_tick_at?: string | null;
  last_successful_tick_at?: string | null;
  last_error?: string | null;
  updated_at: string;
}

export class SchedulerHealthRepository {
  markTick(name: string, date = new Date()) {
    this.upsert(name, { last_tick_at: date.toISOString(), last_error: null });
  }

  markSuccess(name: string, date = new Date()) {
    this.upsert(name, { last_successful_tick_at: date.toISOString(), last_error: null });
  }

  markError(name: string, error: unknown, date = new Date()) {
    this.upsert(name, { last_error: error instanceof Error ? error.message : String(error), last_tick_at: date.toISOString() });
  }

  get(name: string): SchedulerHealthRow | undefined {
    return db.prepare("SELECT * FROM scheduler_health WHERE scheduler_name = ?").get(name) as SchedulerHealthRow | undefined;
  }

  private upsert(name: string, patch: Partial<SchedulerHealthRow>) {
    const current = this.get(name);
    const updatedAt = nowIso();
    db.prepare(
      `INSERT INTO scheduler_health (scheduler_name, last_tick_at, last_successful_tick_at, last_error, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(scheduler_name) DO UPDATE SET
         last_tick_at = excluded.last_tick_at,
         last_successful_tick_at = excluded.last_successful_tick_at,
         last_error = excluded.last_error,
         updated_at = excluded.updated_at`
    ).run(
      name,
      patch.last_tick_at ?? current?.last_tick_at ?? null,
      patch.last_successful_tick_at ?? current?.last_successful_tick_at ?? null,
      patch.last_error ?? current?.last_error ?? null,
      updatedAt
    );
  }
}

export const schedulerHealthRepository = new SchedulerHealthRepository();
