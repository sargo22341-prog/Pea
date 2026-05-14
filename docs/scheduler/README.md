# Market scheduler

The market scheduler coordinates open checks, live refreshes and close finalization without assuming a single process.

## Locks

`scheduler_locks` stores lock ownership with an expiry timestamp. A scheduler instance must acquire a lock before doing overlapping work. Renewals are owner-only, and release is owner-only, so a stale or competing process cannot accidentally free another instance's lock.

## Heartbeat

`scheduler_health` records `last_tick_at`, `last_successful_tick_at`, `last_error` and `updated_at`. The admin screen can read this row to show whether the scheduler is alive and whether the last tick completed.

## Queue construction

The construction queue persists work in `data_construction_tasks`. Reads do not rebuild every missing range inline. Instead they return the available chart data plus preparation metadata, then enqueue missing work.

Queue keys dedupe active work by asset/range/task type. A full rebuild expands into smaller tasks so failed or interrupted work can resume.

## Priorities and workers

Tasks have priority so user-visible or post-close work can run before bulk rebuilds. Workers pull pending tasks, mark them running, execute the matching construction path, and record success or failure. Yahoo calls remain rate-limited through the Yahoo facade.

## Symbol locks

Live and lazy chart refresh paths use symbol-level locks to avoid duplicate Yahoo chart calls for the same asset/range while another refresh is already running.

## Multi-instance behavior

Multi-instance safety comes from three layers:

- global scheduler locks prevent overlapping ticks,
- persisted task state prevents losing queued work,
- symbol locks and in-flight refresh maps prevent duplicate work at asset level.

The design is best-effort for SQLite deployments: it prevents normal overlap and stale owner release, but it is not a distributed consensus system.
