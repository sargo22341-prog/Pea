import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function runBackendScript(script: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pea-market-auto-"));
  const sqlitePath = path.join(tempDir, "test.sqlite");
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "development", SQLITE_PATH: sqlitePath }
  });
  fs.rmSync(tempDir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.split(/\r?\n/).find((entry) => entry.startsWith("__RESULT__"));
  assert.ok(line, result.stdout);
  return JSON.parse(line.slice("__RESULT__".length));
}

const seedUser = `
db.prepare("INSERT INTO users (username, password_hash) VALUES ('tester', 'hash')").run();
`;

const helpers = `
function addTracked(symbol, name, exchange) {
  db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES (?, ?, ?, 'EUR')").run(symbol, name, exchange);
  db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, ?, ?, 1, 10, 'EUR')").run(symbol, name);
}
function quoteRow(symbol, state = "REGULAR") {
  return {
    quote: { symbol, name: symbol, price: 10, currency: "EUR", marketState: state },
    snapshot: { symbol, marketState: state, regularMarketPrice: 10, currency: "EUR", exchange: symbol.endsWith(".T") ? "JPX" : "Paris" }
  };
}
`;

test("scheduler groups assets by market and does at most one Yahoo batch call per market", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { yahooApi } from "./services/yahoo/yahoo.api.ts";
    import { trackedMarketRepository } from "./services/tache_auto/tracked-market.repository.ts";
    import { marketOpenTask } from "./services/tache_auto/market-open.task.ts";
    ${seedUser}
    ${helpers}
    for (let i = 0; i < 14; i += 1) addTracked("PAR" + i + ".PA", "Paris " + i, "Paris");
    for (let i = 0; i < 5; i += 1) addTracked("AMS" + i + ".AS", "Amsterdam " + i, "Amsterdam");
    const calls = [];
    yahooApi.quoteBatchRaw = async (symbols) => {
      calls.push([...symbols]);
      return symbols.map((symbol) => quoteRow(symbol, "REGULAR"));
    };
    const groups = trackedMarketRepository.syncFromTrackedAssets();
    for (const group of groups.values()) await marketOpenTask.run(group, new Date("2026-05-06T07:05:00.000Z"));
    const runs = db.prepare("SELECT market_key, open_status, open_attempts FROM market_daily_runs ORDER BY market_key").all();
    console.log("__RESULT__" + JSON.stringify({ callCount: calls.length, callSizes: calls.map((c) => c.length).sort((a,b) => a-b), runs }));
  `);

  assert.equal(result.callCount, 2);
  assert.deepEqual(result.callSizes, [5, 14]);
  assert.ok(result.runs.every((run: any) => run.open_status === "confirmed_open"));
});

test("partial Yahoo response refreshes valid snapshots and marks partial open", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { yahooApi } from "./services/yahoo/yahoo.api.ts";
    import { trackedMarketRepository } from "./services/tache_auto/tracked-market.repository.ts";
    import { marketOpenTask } from "./services/tache_auto/market-open.task.ts";
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    addTracked("BBB.PA", "BBB", "Paris");
    yahooApi.quoteBatchRaw = async (symbols) => symbols.filter((symbol) => symbol !== "BBB.PA").map((symbol) => quoteRow(symbol, "REGULAR"));
    const group = trackedMarketRepository.syncFromTrackedAssets().get("euronextParis");
    await marketOpenTask.run(group, new Date("2026-05-06T07:05:00.000Z"));
    const run = db.prepare("SELECT open_status, open_attempts, open_last_error FROM market_daily_runs").get();
    const snapshots = db.prepare("SELECT COUNT(*) AS count FROM asset_market_snapshots").get();
    const log = db.prepare("SELECT partial_success, valid_symbols_count, failed_symbols_count FROM market_check_logs").get();
    console.log("__RESULT__" + JSON.stringify({ run, snapshots, log }));
  `);

  assert.equal(result.run.open_status, "confirmed_open_partial");
  assert.equal(result.snapshots.count, 1);
  assert.equal(result.log.partial_success, 1);
  assert.equal(result.log.valid_symbols_count, 1);
  assert.equal(result.log.failed_symbols_count, 1);
});

test("closed-at-open retry is persisted then becomes holiday_suspected after one hour", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { yahooApi } from "./services/yahoo/yahoo.api.ts";
    import { trackedMarketRepository } from "./services/tache_auto/tracked-market.repository.ts";
    import { marketOpenTask } from "./services/tache_auto/market-open.task.ts";
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    let calls = 0;
    yahooApi.quoteBatchRaw = async (symbols) => { calls += 1; return symbols.map((symbol) => quoteRow(symbol, "CLOSED")); };
    const group = trackedMarketRepository.syncFromTrackedAssets().get("euronextParis");
    await marketOpenTask.run(group, new Date("2026-05-06T07:01:00.000Z"));
    const first = db.prepare("SELECT open_status, open_attempts, next_open_check_at FROM market_daily_runs").get();
    await marketOpenTask.run(group, new Date("2026-05-06T08:01:00.000Z"));
    const second = db.prepare("SELECT open_status, open_attempts, next_open_check_at FROM market_daily_runs").get();
    console.log("__RESULT__" + JSON.stringify({ calls, first, second }));
  `);

  assert.equal(result.calls, 1);
  assert.equal(result.first.open_status, "pending");
  assert.ok(result.first.next_open_check_at);
  assert.equal(result.second.open_status, "holiday_suspected");
  assert.equal(result.second.next_open_check_at, null);
});

test("late server start after close marks missed_open_window instead of holiday_suspected", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { yahooApi } from "./services/yahoo/yahoo.api.ts";
    import { marketScheduler } from "./services/tache_auto/market-scheduler.service.ts";
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    let calls = 0;
    yahooApi.quoteBatchRaw = async (symbols) => { calls += 1; return symbols.map((symbol) => quoteRow(symbol, "CLOSED")); };
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });
    await marketScheduler.tick(new Date("2026-05-06T15:50:00.000Z"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const run = db.prepare("SELECT open_status, open_attempts, open_last_checked_at, close_status FROM market_daily_runs").get();
    const logs = db.prepare("SELECT phase, message FROM market_check_logs ORDER BY id").all();
    console.log("__RESULT__" + JSON.stringify({ calls, run, logs }));
  `);

  assert.equal(result.calls, 1, "seule la cloture doit appeler Yahoo au demarrage tardif apres close");
  assert.equal(result.run.open_status, "missed_open_window");
  assert.equal(result.run.open_attempts, 0);
  assert.equal(result.run.open_last_checked_at, null);
  assert.equal(result.run.close_status, "confirmed_closed");
  assert.ok(result.logs.some((log: any) => log.phase === "open" && log.message === "missed_open_window"));
});

test("weekend is skipped without Yahoo calls", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { yahooApi } from "./services/yahoo/yahoo.api.ts";
    import { trackedMarketRepository } from "./services/tache_auto/tracked-market.repository.ts";
    import { marketOpenTask } from "./services/tache_auto/market-open.task.ts";
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    let calls = 0;
    yahooApi.quoteBatchRaw = async (symbols) => { calls += 1; return symbols.map((symbol) => quoteRow(symbol)); };
    const group = trackedMarketRepository.syncFromTrackedAssets().get("euronextParis");
    await marketOpenTask.run(group, new Date("2026-05-09T08:00:00.000Z"));
    const run = db.prepare("SELECT open_status, close_status FROM market_daily_runs").get();
    console.log("__RESULT__" + JSON.stringify({ calls, run }));
  `);

  assert.equal(result.calls, 0);
  assert.equal(result.run.open_status, "skipped_weekend");
  assert.equal(result.run.close_status, "skipped_weekend");
});

test("close confirmation refreshes snapshots before one unique post-close finalization", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { yahooApi } from "./services/yahoo/yahoo.api.ts";
    import { trackedMarketRepository } from "./services/tache_auto/tracked-market.repository.ts";
    import { marketCloseTask } from "./services/tache_auto/market-close.task.ts";
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    addTracked("BBB.PA", "BBB", "Paris");
    let calls = 0;
    yahooApi.quoteBatchRaw = async (symbols) => { calls += 1; return symbols.map((symbol) => quoteRow(symbol, "CLOSED")); };
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });
    const group = trackedMarketRepository.syncFromTrackedAssets().get("euronextParis");
    await marketCloseTask.run(group, new Date("2026-05-06T15:50:00.000Z"));
    await marketCloseTask.run(group, new Date("2026-05-06T15:55:00.000Z"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const run = db.prepare("SELECT close_status, close_job_id, close_attempts FROM market_daily_runs").get();
    const snapshots = db.prepare("SELECT COUNT(*) AS count FROM asset_market_snapshots").get();
    const logs = db.prepare("SELECT COUNT(*) AS count FROM market_check_logs WHERE phase = 'close'").get();
    console.log("__RESULT__" + JSON.stringify({ calls, run, snapshots, logs }));
  `);

  assert.equal(result.calls, 1);
  assert.equal(result.run.close_status, "confirmed_closed");
  assert.ok(result.run.close_job_id);
  assert.equal(result.snapshots.count, 2);
  assert.equal(result.logs.count, 1);
});

test("scheduler cleanup, health update and anti-overlap guard", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { yahooApi } from "./services/yahoo/yahoo.api.ts";
    import { marketScheduler } from "./services/tache_auto/market-scheduler.service.ts";
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
