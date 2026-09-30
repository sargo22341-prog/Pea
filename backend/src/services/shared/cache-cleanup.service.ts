import { cacheMaintenanceRepository, expirableCacheTables } from "../../repositories/cache/cache-maintenance.repository.js";
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

    for (const table of expirableCacheTables) {
      let tableDeleted = 0;
      for (;;) {
        const changes = cacheMaintenanceRepository.deleteExpiredBatch(table, nowMs, batchSize);
        tableDeleted += changes;
        if (changes < batchSize) break;
      }
      deleted[table] = tableDeleted;
    }

    const reclaimedPages = cacheMaintenanceRepository.reclaimFreePages();
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
