import { db } from "../../db.js";
import { logger } from "./logger.service.js";

export interface CacheCleanupResult {
  deleted: Record<string, number>;
  durationMs: number;
  totalDeleted: number;
  reclaimedPages: number;
}

export interface CacheCleanupStats {
  lastRunAt?: string;
  durationMs?: number;
  deletedRows?: Record<string, number> | undefined;
  totalDeletedRows?: number;
  lastError?: string;
  lastErrorAt?: string;
}

const defaultIntervalMs = 60 * 60 * 1000;
const defaultBatchSize = 500;
const expirableTables = [
  "cache_entries",
  "portfolio_chart_cache",
  "portfolio_positions_performance_cache",
  "frontend_block_cache"
] as const;

export class CacheCleanupService {
  private timer?: NodeJS.Timeout | undefined;
  private lastStats: CacheCleanupStats = {};

  start(intervalMs = defaultIntervalMs) {
    if (this.timer) return;
    this.safePurgeExpired();
    this.timer = setInterval(() => {
      this.safePurgeExpired();
    }, intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  purgeExpired(nowMs = Date.now(), batchSize = defaultBatchSize): CacheCleanupResult {
    const startedAt = performance.now();
    const deleted: Record<string, number> = {};

    for (const table of expirableTables) {
      let tableDeleted = 0;
      for (;;) {
        const changes = db.prepare(
          `DELETE FROM ${table}
           WHERE rowid IN (
             SELECT rowid FROM ${table}
             WHERE expires_at IS NOT NULL AND expires_at <= ?
             LIMIT ?
           )`
        ).run(nowMs, batchSize);
        tableDeleted += changes;
        if (changes < batchSize) break;
      }
      deleted[table] = tableDeleted;
    }

    const reclaimedPages = this.reclaimFreePages();
    const durationMs = Math.round(performance.now() - startedAt);
    const totalDeleted = Object.values(deleted).reduce((sum, count) => sum + count, 0);
    this.lastStats = {
      lastRunAt: new Date().toISOString(),
      durationMs,
      deletedRows: deleted,
      totalDeletedRows: totalDeleted
    };
    logger.info("cache", "expired cache cleanup completed", { deleted, totalDeleted, reclaimedPages, durationMs });
    return { deleted, durationMs, totalDeleted, reclaimedPages };
  }

  /**
   * Rend au disque les pages SQLite liberees (auto_vacuum incremental, migration 35).
   * Sans effet si la base n'est pas en mode incremental.
   */
  private reclaimFreePages() {
    const freePages = () => (db.prepare("PRAGMA freelist_count").get() as { freelist_count: number }).freelist_count;
    const before = freePages();
    if (before === 0) return 0;
    db.exec("PRAGMA incremental_vacuum");
    return before - freePages();
  }

  stats(): CacheCleanupStats {
    return { ...this.lastStats, deletedRows: this.lastStats.deletedRows ? { ...this.lastStats.deletedRows } : undefined };
  }

  private safePurgeExpired() {
    try {
      this.purgeExpired();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastStats = { ...this.lastStats, lastError: message, lastErrorAt: new Date().toISOString() };
      logger.warn("cache", "cache cleanup failed", { error: message });
    }
  }
}

export const cacheCleanupService = new CacheCleanupService();
