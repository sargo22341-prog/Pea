import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function runBackendScript(script: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pea-cleaner-"));
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

test("rebuild 1d invalide les caches frontend et portfolio 1d sans utiliser les ranges d'affichage", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { marketDataCleaner } = await import("./services/market/construction/market-data-cleaner.ts");
    const now = Date.now();
    const expiresAt = now + 60_000;
    db.prepare("INSERT INTO users (username, password_hash) VALUES ('tester', 'hash')").run();
    db.prepare("INSERT INTO portfolio_chart_cache (cache_key, user_id, range, payload, cached_at, expires_at) VALUES ('1:1d', '1', '1d', '{}', ?, ?), ('1:1w', '1', '1w', '{}', ?, ?), ('1:intraday', '1', 'intraday', '{}', ?, ?)").run(now, expiresAt, now, expiresAt, now, expiresAt);
    db.prepare("INSERT INTO portfolio_positions_performance_cache (cache_key, user_id, range, portfolio_version, market_data_version, payload, cached_at, expires_at) VALUES ('1:1d', '1', '1d', 'p', 'm', '[]', ?, ?), ('1:1w', '1', '1w', 'p', 'm', '[]', ?, ?)").run(now, expiresAt, now, expiresAt);
    db.prepare("INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at) VALUES ('1:portfolio-summary:1d', '1', 'portfolio-summary', '1d', '{}', ?, ?), ('1:watchlist:1d', '1', 'watchlist', '1d', '[]', ?, ?), ('1:analysis:default', '1', 'analysis', NULL, '{}', ?, ?)").run(now, expiresAt, now, expiresAt, now, expiresAt);

    const job = marketDataCleaner.rebuildMarketData({ range: "1d" });
    const counts = {
      chart1d: db.prepare("SELECT COUNT(*) AS count FROM portfolio_chart_cache WHERE range = '1d'").get().count,
      chart1w: db.prepare("SELECT COUNT(*) AS count FROM portfolio_chart_cache WHERE range = '1w'").get().count,
      displayIntraday: db.prepare("SELECT COUNT(*) AS count FROM portfolio_chart_cache WHERE range = 'intraday'").get().count,
      perf1d: db.prepare("SELECT COUNT(*) AS count FROM portfolio_positions_performance_cache WHERE range = '1d'").get().count,
      perf1w: db.prepare("SELECT COUNT(*) AS count FROM portfolio_positions_performance_cache WHERE range = '1w'").get().count,
      frontend: db.prepare("SELECT COUNT(*) AS count FROM frontend_block_cache").get().count
    };
    console.log("__RESULT__" + JSON.stringify({ job, counts }));
  `);

  assert.equal(result.counts.chart1d, 0);
  assert.equal(result.counts.chart1w, 1);
  assert.equal(result.counts.displayIntraday, 1, "les anciennes ranges d'affichage ne doivent pas piloter la suppression");
  assert.equal(result.counts.perf1d, 0);
  assert.equal(result.counts.perf1w, 1);
  assert.equal(result.counts.frontend, 0);
});

test("rebuild all invalide les ranges API longues", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { marketDataCleaner } = await import("./services/market/construction/market-data-cleaner.ts");
    const now = Date.now();
    const expiresAt = now + 60_000;
    const ranges = ["ytd", "1y", "5y", "10y", "all", "1m"];
    for (const range of ranges) {
      db.prepare("INSERT INTO portfolio_chart_cache (cache_key, user_id, range, payload, cached_at, expires_at) VALUES (?, '1', ?, '{}', ?, ?)").run("chart:" + range, range, now, expiresAt);
      db.prepare("INSERT INTO portfolio_positions_performance_cache (cache_key, user_id, range, portfolio_version, market_data_version, payload, cached_at, expires_at) VALUES (?, '1', ?, 'p', 'm', '[]', ?, ?)").run("perf:" + range, range, now, expiresAt);
    }
    marketDataCleaner.rebuildMarketData({ range: "all" });
    const remainingCharts = db.prepare("SELECT range FROM portfolio_chart_cache ORDER BY range").all().map((row) => row.range);
    const remainingPerf = db.prepare("SELECT range FROM portfolio_positions_performance_cache ORDER BY range").all().map((row) => row.range);
    console.log("__RESULT__" + JSON.stringify({ remainingCharts, remainingPerf }));
  `);

  assert.deepEqual(result.remainingCharts, ["1m"]);
  assert.deepEqual(result.remainingPerf, ["1m"]);
});

test("refresh-annex admin retourne un job agrege qui couvre toutes les taches lancees", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    const { financialsService } = await import("./services/market/financials/financials.service.ts");
    const { dividendsService } = await import("./services/market/dividends/dividends.service.ts");
    const { yahooService } = await import("./services/yahoo/index.ts");
    marketSnapshotService.refreshMarketSnapshot = async (asset) => ({ symbol: typeof asset === "string" ? asset : asset.symbol, name: "AAA", price: 1, currency: "EUR" });
    financialsService.refreshFinancials = async () => ({ updated: 1 });
    dividendsService.refreshDividends = async () => ({ updated: 1 });
    yahooService.marketInfo = async () => ({ data: { averageDailyVolume3Month: 6128825, fiftyTwoWeekLow: 49.24, fiftyTwoWeekHigh: 81.34, exDividendDate: "2026-06-30T00:00:00.000Z" } });
    yahooService.extraData = async () => ({ data: {} });

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const password = "correct horse battery staple";
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "admin", password, confirmPassword: password })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES ('AAA.PA', 'AAA', 'Paris', 'EUR')").run();
        db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, 'AAA.PA', 'AAA', 1, 10, 'EUR')").run();
        db.prepare("INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at) VALUES ('1:watchlist:1d', '1', 'watchlist', '1d', '[]', 1, 9999999999999)").run();
        const response = await fetch(\`\${baseUrl}/api/admin/market-data/refresh-annex\`, {
          method: "POST",
          headers: { Cookie: cookie }
        });
        const body = await response.json();
        await new Promise((resolve) => setTimeout(resolve, 100));
        const snapshot = db.prepare("SELECT average_volume_3m, fifty_two_week_low, fifty_two_week_high, ex_dividend_date FROM asset_market_snapshots s JOIN assets a ON a.id = s.asset_id WHERE a.symbol = 'AAA.PA'").get();
        const frontendCacheCount = db.prepare("SELECT COUNT(*) AS count FROM frontend_block_cache").get().count;
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body, snapshot, frontendCacheCount }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 200);
  assert.equal(result.body.totalTasks, 4);
  assert.equal(result.body.id.startsWith("job-"), true);
  assert.equal(["queued", "running", "success"].includes(result.body.status), true);
  assert.equal(result.snapshot.average_volume_3m, 6128825);
  assert.equal(result.snapshot.fifty_two_week_low, 49.24);
  assert.equal(result.snapshot.fifty_two_week_high, 81.34);
  assert.equal(result.snapshot.ex_dividend_date, "2026-06-30T00:00:00.000Z");
  assert.equal(result.frontendCacheCount, 0);
});

test("queue construction persiste, dedupe les taches actives et reprend une tache interrompue", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { dataConstructionQueue, DataConstructionQueueService } = await import("./services/market/construction/data-construction-queue.service.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");

    db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES ('AAA.PA', 'AAA', 'Paris', 'EUR')").run();
    let resolveSnapshot;
    let snapshotCalls = 0;
    marketSnapshotService.refreshMarketSnapshot = async () => {
      snapshotCalls += 1;
      await new Promise((resolve) => { resolveSnapshot = resolve; });
      return { symbol: "AAA.PA", name: "AAA", price: 1, currency: "EUR" };
    };

    const first = dataConstructionQueue.enqueueForSymbols("snapshot", ["AAA.PA"]);
    const second = dataConstructionQueue.enqueueForSymbols("snapshot", ["AAA.PA"]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const activeTaskCount = db.prepare("SELECT COUNT(*) AS count FROM data_construction_tasks WHERE status IN ('queued', 'running')").get().count;
    resolveSnapshot();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const timestamp = new Date().toISOString();
    db.prepare("INSERT INTO data_construction_jobs (id, message, created_at, updated_at) VALUES ('restart-job', 'Reprise', ?, ?)").run(timestamp, timestamp);
    db.prepare(\`
      INSERT INTO data_construction_tasks
        (job_id, task_key, type, symbol, message, status, attempts, started_at, created_at, updated_at)
      VALUES ('restart-job', 'RESTART:AAA.PA:SNAPSHOT', 'snapshot', 'AAA.PA', 'AAA.PA - reprise snapshot', 'running', 1, ?, ?, ?)
    \`).run(timestamp, timestamp, timestamp);

    let resumed = 0;
    marketSnapshotService.refreshMarketSnapshot = async () => {
      resumed += 1;
      return { symbol: "AAA.PA", name: "AAA", price: 1, currency: "EUR" };
    };
    new DataConstructionQueueService();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const statuses = db.prepare("SELECT task_key, status, attempts FROM data_construction_tasks ORDER BY id").all();
    const latest = dataConstructionQueue.latest();
    console.log("__RESULT__" + JSON.stringify({ first, second, activeTaskCount, snapshotCalls, resumed, statuses, latest }));
  `);

  assert.equal(result.first.totalTasks, 1);
  assert.equal(result.second.totalTasks, 1);
  assert.equal(result.activeTaskCount, 1);
  assert.equal(result.snapshotCalls, 1);
  assert.equal(result.resumed, 1);
  assert.equal(result.statuses.length, 2);
  assert.ok(result.statuses.every((row: any) => row.status === "success"));
  assert.equal(result.statuses.find((row: any) => row.task_key === "RESTART:AAA.PA:SNAPSHOT")?.attempts, 2);
  assert.equal(result.latest.status, "success");
});
