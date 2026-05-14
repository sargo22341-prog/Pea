import { db } from "../../db.js";
import { logger } from "./logger.service.js";

export interface CacheCleanupResult {
  deleted: Record<string, number>;
  durationMs: number;
  totalDeleted: number;
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
  private timer?: NodeJS.Timeout;

  start(intervalMs = defaultIntervalMs) {
    if (this.timer) return;
    this.safePurgeExpired();
    this.timer = setInterval(() => {
      this.safePurgeExpired();
    }, intervalMs);
    this.timer.unref?.();
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
      while (true) {
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

    const durationMs = Math.round(performance.now() - startedAt);
    const totalDeleted = Object.values(deleted).reduce((sum, count) => sum + count, 0);
    logger.info("cache", "expired cache cleanup completed", { deleted, totalDeleted, durationMs });
    return { deleted, durationMs, totalDeleted };
  }

  private safePurgeExpired() {
    try {
      this.purgeExpired();
    } catch (error) {
      logger.warn("cache", "cache cleanup failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

export const cacheCleanupService = new CacheCleanupService();
