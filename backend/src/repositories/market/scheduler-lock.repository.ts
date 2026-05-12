import { randomUUID } from "node:crypto";
import { db } from "../../db.js";

export interface SchedulerLockLease {
  key: string;
  owner: string;
}

export class SchedulerLockRepository {
  acquire(key: string, ttlMs: number, now = Date.now()): SchedulerLockLease | undefined {
    const owner = randomUUID();
    const expiresAt = now + ttlMs;
    db.prepare("DELETE FROM scheduler_locks WHERE expires_at <= ?").run(now);
    const changes = db.prepare(
      `INSERT OR IGNORE INTO scheduler_locks (lock_key, owner, expires_at, acquired_at)
       VALUES (?, ?, ?, ?)`
    ).run(key, owner, expiresAt, new Date(now).toISOString());
    return changes > 0 ? { key, owner } : undefined;
  }

  release(lease: SchedulerLockLease) {
    db.prepare("DELETE FROM scheduler_locks WHERE lock_key = ? AND owner = ?").run(lease.key, lease.owner);
  }
}

export const schedulerLockRepository = new SchedulerLockRepository();
