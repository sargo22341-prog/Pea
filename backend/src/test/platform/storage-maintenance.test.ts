import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

test("candle reads use the UNIQUE index once the redundant indexes are dropped, including on upgraded databases", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { applyMigrations } = await import("./db-migrations.ts");
    // Base mise a niveau : les anciens index existent et les migrations 34/35 ne sont pas encore passees.
    db.exec("CREATE INDEX idx_chart_candles_asset_range_interval ON chart_candles(asset_id, range_key, interval)");
    db.exec("CREATE INDEX idx_chart_candles_asset_range_interval_start ON chart_candles(asset_id, range_key, interval, datetime_start)");
    db.exec("DELETE FROM _migrations WHERE version IN (34, 35)");
    applyMigrations(db);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'chart_candles'").all().map((row) => row.name);
    const plan = db.prepare("EXPLAIN QUERY PLAN SELECT datetime_start, close FROM chart_candles WHERE asset_id = ? AND range_key = ? AND interval = ? AND datetime_start >= ? ORDER BY datetime_start ASC")
      .all(1, "all", "1d", "").map((row) => row.detail).join(" | ");
    const autoVacuum = db.prepare("PRAGMA auto_vacuum").get().auto_vacuum;
    console.log("__RESULT__" + JSON.stringify({ indexes, plan, autoVacuum }));
  `) as { indexes: string[]; plan: string; autoVacuum: number };

  assert.deepEqual(result.indexes, ["sqlite_autoindex_chart_candles_1"]);
  assert.match(result.plan, /USING INDEX sqlite_autoindex_chart_candles_1/);
  assert.doesNotMatch(result.plan, /TEMP B-TREE/);
  assert.equal(result.autoVacuum, 2, "auto_vacuum must be INCREMENTAL");
});

test("cache cleanup gives freed pages back to the disk", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { cacheCleanupService } = await import("./services/shared/cache-cleanup.service.ts");
    const payload = "x".repeat(20000);
    const insert = db.prepare("INSERT INTO cache_entries (scope, key, payload, fetched_at, expires_at) VALUES ('test', ?, ?, 0, 1)");
    db.transaction(() => { for (let index = 0; index < 200; index += 1) insert.run("key-" + index, payload); });
    const pagesBefore = db.prepare("PRAGMA page_count").get().page_count;
    const cleanup = cacheCleanupService.purgeExpired(10);
    const pagesAfter = db.prepare("PRAGMA page_count").get().page_count;
    const freeAfter = db.prepare("PRAGMA freelist_count").get().freelist_count;
    console.log("__RESULT__" + JSON.stringify({ cleanup, pagesBefore, pagesAfter, freeAfter }));
  `) as { cleanup: { totalDeleted: number; reclaimedPages: number }; pagesBefore: number; pagesAfter: number; freeAfter: number };

  assert.equal(result.cleanup.totalDeleted, 200);
  assert.ok(result.cleanup.reclaimedPages > 500, String(result.cleanup.reclaimedPages));
  assert.equal(result.freeAfter, 0);
  assert.ok(result.pagesAfter < result.pagesBefore / 2);
});

test("the database runs in WAL mode with NORMAL synchronous writes", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    console.log("__RESULT__" + JSON.stringify({
      journalMode: db.prepare("PRAGMA journal_mode").get().journal_mode,
      synchronous: db.prepare("PRAGMA synchronous").get().synchronous
    }));
  `) as { journalMode: string; synchronous: number };

  assert.equal(result.journalMode, "wal");
  assert.equal(result.synchronous, 1, "NORMAL avoids one fsync per cache write and is safe in WAL mode");
});
