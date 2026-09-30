import { db } from "../../db.js";

/** Tables de cache dont les lignes portent une date d'expiration `expires_at`. */
export const expirableCacheTables = [
  "cache_entries",
  "portfolio_chart_cache",
  "portfolio_positions_performance_cache",
  "frontend_block_cache"
] as const;

export type ExpirableCacheTable = (typeof expirableCacheTables)[number];

/** Maintenance physique des caches : purge des lignes expirées et restitution de l'espace disque. */
export class CacheMaintenanceRepository {
  /** Supprime au plus `batchSize` lignes expirées et renvoie le nombre supprimé. */
  deleteExpiredBatch(table: ExpirableCacheTable, nowMs: number, batchSize: number) {
    return db.prepare(
      `DELETE FROM ${table}
       WHERE rowid IN (
         SELECT rowid FROM ${table}
         WHERE expires_at IS NOT NULL AND expires_at <= ?
         LIMIT ?
       )`
    ).run(nowMs, batchSize);
  }

  /**
   * Rend au disque les pages SQLite libérées (auto_vacuum incrémental, migration 35) et renvoie
   * leur nombre. Sans effet si la base n'est pas en mode incrémental.
   */
  reclaimFreePages() {
    const freePages = () => (db.prepare("PRAGMA freelist_count").get() as { freelist_count: number }).freelist_count;
    const before = freePages();
    if (before === 0) return 0;
    db.exec("PRAGMA incremental_vacuum");
    return before - freePages();
  }
}

export const cacheMaintenanceRepository = new CacheMaintenanceRepository();
