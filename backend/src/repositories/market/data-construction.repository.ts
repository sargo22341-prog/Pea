import { db } from "../../db.js";

export type DataConstructionTaskStatus = "queued" | "running" | "success" | "error";

export interface DataConstructionTaskInput {
  taskKey: string;
  type: string;
  symbol?: string;
  range?: string;
  marketKey?: string;
  tradingDate?: string;
  phase?: string;
  message: string;
  priority: number;
}

export interface DataConstructionTaskRow {
  id: number;
  job_id: string;
  task_key: string;
  type: string;
  symbol?: string | null;
  range?: string | null;
  market_key?: string | null;
  trading_date?: string | null;
  phase?: string | null;
  message: string;
  status: DataConstructionTaskStatus;
  attempts: number;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DataConstructionJobRow {
  id: string;
  message: string;
  created_at: string;
  updated_at: string;
}

export interface DataConstructionJobSummary extends DataConstructionJobRow {
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  running_tasks: number;
  current_task_label?: string | null;
  errors_json?: string | null;
}

export interface DataConstructionRuntimeStats {
  pending: number;
  running: number;
  failed: number;
  completed: number;
  oldest_pending_at?: string | null;
  oldest_running_at?: string | null;
  by_type_priority: Array<{ type: string; priority: number; pending: number; running: number; failed: number; completed: number }>;
}

function nowIso() {
  return new Date().toISOString();
}

export const dataConstructionRepository = {
  createJob(jobId: string, message: string, tasks: DataConstructionTaskInput[], options: { force?: boolean } = {}) {
    const timestamp = nowIso();
    const inserted: DataConstructionTaskRow[] = [];

    db.transaction(() => {
      db.prepare("INSERT INTO data_construction_jobs (id, message, created_at, updated_at) VALUES (?, ?, ?, ?)").run(jobId, message, timestamp, timestamp);

      const insertTask = db.prepare(
        `INSERT INTO data_construction_tasks
          (job_id, task_key, type, symbol, range, market_key, trading_date, phase, message, status, priority, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`
      );

      for (const task of tasks) {
        const taskKey = options.force ? `${task.taskKey}:FORCE:${jobId}` : task.taskKey;
        const changes = insertTask.run(
          jobId,
          taskKey,
          task.type,
          task.symbol ?? null,
          task.range ?? null,
          task.marketKey ?? null,
          task.tradingDate ?? null,
          task.phase ?? null,
          task.message,
          task.priority,
          timestamp,
          timestamp
        );
        if (changes > 0) {
          const row = db.prepare("SELECT * FROM data_construction_tasks WHERE rowid = last_insert_rowid()").get() as DataConstructionTaskRow;
          inserted.push(row);
        }
      }
    });

    if (!inserted.length) {
      db.prepare("DELETE FROM data_construction_jobs WHERE id = ?").run(jobId);
    }
    return inserted;
  },

  activeTaskKeys(keys: string[]) {
    if (!keys.length) return new Set<string>();
    const placeholders = keys.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT task_key FROM data_construction_tasks WHERE status IN ('queued', 'running') AND task_key IN (${placeholders})`)
      .all(...keys) as Array<{ task_key: string }>;
    return new Set(rows.map((row) => row.task_key));
  },

  latestJob(): DataConstructionJobSummary | undefined {
    return db
      .prepare(
        `SELECT j.*,
                COUNT(t.id) AS total_tasks,
                SUM(CASE WHEN t.status = 'success' THEN 1 ELSE 0 END) AS completed_tasks,
                SUM(CASE WHEN t.status = 'error' THEN 1 ELSE 0 END) AS failed_tasks,
                SUM(CASE WHEN t.status = 'running' THEN 1 ELSE 0 END) AS running_tasks,
                (SELECT message FROM data_construction_tasks rt WHERE rt.job_id = j.id AND rt.status = 'running' ORDER BY rt.started_at DESC, rt.id DESC LIMIT 1) AS current_task_label,
                (SELECT json_group_array(task_key || ': ' || error_message) FROM data_construction_tasks et WHERE et.job_id = j.id AND et.status = 'error') AS errors_json
         FROM data_construction_jobs j
         LEFT JOIN data_construction_tasks t ON t.job_id = j.id
         GROUP BY j.id
         ORDER BY j.updated_at DESC
         LIMIT 1`
      )
      .get() as DataConstructionJobSummary | undefined;
  },

  /**
   * Réclame la prochaine tâche en attente.
   *
   * Tri : `priority ASC` (plus petit = plus prioritaire) puis `id ASC` (FIFO à priorité égale).
   * Le `excludeSymbols` permet à un worker de ne pas voler une tâche dont le symbole est déjà
   * traité par un autre worker concurrent (évite les races sur les écritures candles).
   */
  claimNextQueuedTask(excludeSymbols: string[] = []): DataConstructionTaskRow | undefined {
    const baseSql = "SELECT * FROM data_construction_tasks WHERE status = 'queued'";
    const orderClause = "ORDER BY priority ASC, id ASC LIMIT 1";
    let row: DataConstructionTaskRow | undefined;
    if (excludeSymbols.length) {
      const placeholders = excludeSymbols.map(() => "?").join(",");
      row = db
        .prepare(`${baseSql} AND (symbol IS NULL OR symbol NOT IN (${placeholders})) ${orderClause}`)
        .get(...excludeSymbols) as DataConstructionTaskRow | undefined;
    } else {
      row = db.prepare(`${baseSql} ${orderClause}`).get() as DataConstructionTaskRow | undefined;
    }
    if (!row) return undefined;
    const timestamp = nowIso();
    const changed = db
      .prepare(
        `UPDATE data_construction_tasks
         SET status = 'running', attempts = attempts + 1, started_at = ?, updated_at = ?
         WHERE id = ? AND status = 'queued'`
      )
      .run(timestamp, timestamp, row.id);
    if (!changed) return undefined;
    db.prepare("UPDATE data_construction_jobs SET updated_at = ? WHERE id = ?").run(timestamp, row.job_id);
    return db.prepare("SELECT * FROM data_construction_tasks WHERE id = ?").get(row.id) as DataConstructionTaskRow;
  },

  markTaskSuccess(taskId: number) {
    const timestamp = nowIso();
    const row = db.prepare("SELECT job_id FROM data_construction_tasks WHERE id = ?").get(taskId) as { job_id: string } | undefined;
    db.prepare("UPDATE data_construction_tasks SET status = 'success', error_message = NULL, finished_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, taskId);
    if (row) db.prepare("UPDATE data_construction_jobs SET updated_at = ? WHERE id = ?").run(timestamp, row.job_id);
  },

  markTaskError(taskId: number, message: string) {
    const timestamp = nowIso();
    const row = db.prepare("SELECT job_id FROM data_construction_tasks WHERE id = ?").get(taskId) as { job_id: string } | undefined;
    db.prepare("UPDATE data_construction_tasks SET status = 'error', error_message = ?, finished_at = ?, updated_at = ? WHERE id = ?").run(message, timestamp, timestamp, taskId);
    if (row) db.prepare("UPDATE data_construction_jobs SET updated_at = ? WHERE id = ?").run(timestamp, row.job_id);
  },

  resetInterruptedTasks() {
    const timestamp = nowIso();
    return db.prepare("UPDATE data_construction_tasks SET status = 'queued', updated_at = ? WHERE status = 'running'").run(timestamp);
  },

  getJob(jobId: string) {
    return db
      .prepare(
        `SELECT j.*,
                COUNT(t.id) AS total_tasks,
                SUM(CASE WHEN t.status = 'success' THEN 1 ELSE 0 END) AS completed_tasks,
                SUM(CASE WHEN t.status = 'error' THEN 1 ELSE 0 END) AS failed_tasks,
                SUM(CASE WHEN t.status = 'running' THEN 1 ELSE 0 END) AS running_tasks,
                (SELECT message FROM data_construction_tasks rt WHERE rt.job_id = j.id AND rt.status = 'running' ORDER BY rt.started_at DESC, rt.id DESC LIMIT 1) AS current_task_label,
                (SELECT json_group_array(task_key || ': ' || error_message) FROM data_construction_tasks et WHERE et.job_id = j.id AND et.status = 'error') AS errors_json
         FROM data_construction_jobs j
         LEFT JOIN data_construction_tasks t ON t.job_id = j.id
         WHERE j.id = ?
         GROUP BY j.id`
      )
      .get(jobId) as DataConstructionJobSummary | undefined;
  },

  runtimeStats(): DataConstructionRuntimeStats {
    const totals = db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
           SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS completed,
           MIN(CASE WHEN status = 'queued' THEN created_at ELSE NULL END) AS oldest_pending_at,
           MIN(CASE WHEN status = 'running' THEN started_at ELSE NULL END) AS oldest_running_at
         FROM data_construction_tasks`
      )
      .get() as {
        pending?: number | null;
        running?: number | null;
        failed?: number | null;
        completed?: number | null;
        oldest_pending_at?: string | null;
        oldest_running_at?: string | null;
      };
    const byTypePriority = db
      .prepare(
        `SELECT type, priority,
                SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
                SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS failed,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS completed
         FROM data_construction_tasks
         GROUP BY type, priority
         ORDER BY priority ASC, type ASC`
      )
      .all() as DataConstructionRuntimeStats["by_type_priority"];
    return {
      pending: Number(totals.pending ?? 0),
      running: Number(totals.running ?? 0),
      failed: Number(totals.failed ?? 0),
      completed: Number(totals.completed ?? 0),
      oldest_pending_at: totals.oldest_pending_at ?? null,
      oldest_running_at: totals.oldest_running_at ?? null,
      by_type_priority: byTypePriority.map((row) => ({
        type: row.type,
        priority: Number(row.priority),
        pending: Number(row.pending ?? 0),
        running: Number(row.running ?? 0),
        failed: Number(row.failed ?? 0),
        completed: Number(row.completed ?? 0)
      }))
    };
  }
};
