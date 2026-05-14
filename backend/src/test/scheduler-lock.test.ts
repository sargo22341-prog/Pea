import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript as runIsolatedBackendScript, seedUser } from "./helpers/backend-script.js";

/**
 * Tests dédiés à la cohérence du lock SQLite distribué (`scheduler_locks`) et à l'anti-overlap
 * du tick scheduler.
 *
 * Extrait de `market-auto-scheduler.test.ts` (Phase 4.4) pour ramener ce dernier sous 300 lignes.
 */

function runBackendScript(script: string) {
  return runIsolatedBackendScript(script, { tempPrefix: "pea-scheduler-lock-" });
}

test("scheduler cleanup, health update and anti-overlap guard", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { yahooApi } from "./services/yahoo/yahoo.api.ts";
    import { marketScheduler } from "./schedulers/market-scheduler.service.ts";
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    db.prepare("INSERT INTO market_check_logs (market_key, trading_date, phase, checked_at, created_at) VALUES ('x', '2026-01-01', 'open', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')").run();
    let calls = 0;
    yahooApi.quoteBatchRaw = async (symbols) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 80));
      return symbols.map((symbol) => quoteRow(symbol, "REGULAR"));
    };
    const first = marketScheduler.tick(new Date("2026-05-06T07:05:00.000Z"));
    await marketScheduler.tick(new Date("2026-05-06T07:05:01.000Z"));
    await first;
    const health = db.prepare("SELECT * FROM scheduler_health WHERE scheduler_name = 'market-scheduler'").get();
    const oldLogs = db.prepare("SELECT COUNT(*) AS count FROM market_check_logs WHERE market_key = 'x'").get();
    console.log("__RESULT__" + JSON.stringify({ calls, health, oldLogs }));
  `);

  assert.equal(result.calls, 1);
  assert.ok(result.health.last_tick_at);
  assert.ok(result.health.last_successful_tick_at);
  assert.equal(result.oldLogs.count, 0);
});

test("scheduler lock renew and owner-only release semantics", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { schedulerLockRepository } from "./repositories/market/scheduler-lock.repository.ts";

    const first = schedulerLockRepository.acquire("test-lock", 1_000, 1_000, "owner-a");
    const blocked = schedulerLockRepository.acquire("test-lock", 1_000, 1_100, "owner-b");
    const renewed = first ? schedulerLockRepository.renew(first, 5_000, 1_200) : false;
    const afterRenew = db.prepare("SELECT owner, expires_at FROM scheduler_locks WHERE lock_key = 'test-lock'").get();
    schedulerLockRepository.release({ key: "test-lock", owner: "owner-b" });
    const afterWrongRelease = db.prepare("SELECT COUNT(*) AS count FROM scheduler_locks WHERE lock_key = 'test-lock'").get();
    if (first) schedulerLockRepository.release(first);
    const afterRelease = db.prepare("SELECT COUNT(*) AS count FROM scheduler_locks WHERE lock_key = 'test-lock'").get();

    const expired = schedulerLockRepository.acquire("expired-lock", 1_000, 1_000, "old-owner");
    const blockedBeforeExpiry = schedulerLockRepository.acquire("expired-lock", 1_000, 1_999, "new-owner");
    const acquiredAfterExpiry = schedulerLockRepository.acquire("expired-lock", 1_000, 2_001, "new-owner");

    console.log("__RESULT__" + JSON.stringify({
      first: Boolean(first),
      blocked: Boolean(blocked),
      renewed,
      afterRenew,
      afterWrongRelease: afterWrongRelease.count,
      afterRelease: afterRelease.count,
      expired: Boolean(expired),
      blockedBeforeExpiry: Boolean(blockedBeforeExpiry),
      acquiredAfterExpiry
    }));
  `);

  assert.equal(result.first, true);
  assert.equal(result.blocked, false);
  assert.equal(result.renewed, true);
  assert.equal(result.afterRenew.owner, "owner-a");
  assert.equal(result.afterRenew.expires_at, 6200);
  assert.equal(result.afterWrongRelease, 1);
  assert.equal(result.afterRelease, 0);
  assert.equal(result.expired, true);
  assert.equal(result.blockedBeforeExpiry, false);
  assert.equal(result.acquiredAfterExpiry.owner, "new-owner");
});
