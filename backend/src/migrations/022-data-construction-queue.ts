import type { Migration } from "./types.js";

export const dataConstructionQueueMigration: Migration = {
  version: 22,
  description: "Persistance de la queue de construction marche",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS data_construction_jobs (
        id TEXT PRIMARY KEY,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS data_construction_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        task_key TEXT NOT NULL,
        type TEXT NOT NULL,
        symbol TEXT,
        range TEXT,
        market_key TEXT,
        trading_date TEXT,
        phase TEXT,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(job_id) REFERENCES data_construction_jobs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_data_construction_jobs_updated_at
        ON data_construction_jobs(updated_at);
      CREATE INDEX IF NOT EXISTS idx_data_construction_tasks_job_status
        ON data_construction_tasks(job_id, status);
      CREATE INDEX IF NOT EXISTS idx_data_construction_tasks_status_id
        ON data_construction_tasks(status, id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_data_construction_tasks_active_key
        ON data_construction_tasks(task_key)
        WHERE status IN ('queued', 'running');
    `);
  }
};
