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
function pricedQuoteRow(symbol, state, price) {
  return {
    quote: { symbol, name: symbol, price, previousClose: 1000, change: 118, changePercent: 9.94, currency: "EUR", marketState: state },
    snapshot: {
      symbol,
      shortName: symbol + " short",
      longName: symbol + " long",
      quoteType: "EQUITY",
      marketState: state,
      regularMarketPrice: price,
      regularMarketChange: 118,
      regularMarketChangePercent: 9.94,
      regularMarketTime: "2026-05-06T15:45:00.000Z",
      regularMarketPreviousClose: 1000,
      regularMarketOpen: 1190,
      regularMarketDayHigh: 1310,
      regularMarketDayLow: 1175,
      regularMarketVolume: 1234567,
      bid: 1304.5,
      ask: 1305.5,
      bidSize: 10,
      askSize: 11,
      averageDailyVolume3Month: 7654321,
      currency: "EUR",
      exchange: "PAR",
      fullExchangeName: "Paris"
    }
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

test("post-close snapshot state is reused and not overwritten by a later quote read", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { yahooApi } from "./services/yahoo/yahoo.api.ts";
    import { trackedMarketRepository } from "./services/tache_auto/tracked-market.repository.ts";
    import { marketCloseTask } from "./services/tache_auto/market-close.task.ts";
    import { marketSnapshotService } from "./services/market/market-snapshot.service.ts";
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    let batchCalls = 0;
    let singleQuoteCalls = 0;
    yahooApi.quoteBatchRaw = async (symbols) => {
      batchCalls += 1;
      return symbols.map((symbol) => quoteRow(symbol, "CLOSED"));
    };
    yahooApi.quote = async (symbol) => {
      singleQuoteCalls += 1;
      return quoteRow(symbol, "PREPRE");
    };
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });
    const group = trackedMarketRepository.syncFromTrackedAssets().get("euronextParis");
    await marketCloseTask.run(group, new Date("2026-05-06T15:50:00.000Z"));
    const afterClose = db.prepare("SELECT s.market_state FROM asset_market_snapshots s JOIN assets a ON a.id = s.asset_id WHERE a.symbol = 'AAA.PA'").get();
    const quote = await marketSnapshotService.getQuote("AAA.PA");
    const afterRead = db.prepare("SELECT s.market_state FROM asset_market_snapshots s JOIN assets a ON a.id = s.asset_id WHERE a.symbol = 'AAA.PA'").get();
    console.log("__RESULT__" + JSON.stringify({ batchCalls, singleQuoteCalls, quote, afterClose, afterRead }));
  `);

  assert.equal(result.batchCalls, 1);
  assert.equal(result.singleQuoteCalls, 0);
  assert.equal(result.afterClose.market_state, "CLOSED");
  assert.equal(result.afterRead.market_state, "CLOSED");
  assert.equal(result.quote.marketState, "CLOSED");
});

test("post-close snapshot price wins over stale fundamentals and later quote reads", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";
    import { db } from "./db.ts";
    import { yahooApi } from "./services/yahoo/yahoo.api.ts";
    import { yahooService } from "./services/yahoo/index.ts";
    import { trackedMarketRepository } from "./services/tache_auto/tracked-market.repository.ts";
    import { marketCloseTask } from "./services/tache_auto/market-close.task.ts";
    import { marketSnapshotService } from "./services/market/market-snapshot.service.ts";
    ${helpers}

    yahooService.marketInfo = async () => ({ data: { marketState: "POSTPOST", regularMarketPrice: 1187, currency: "EUR" } });
    yahooService.extraData = async () => ({
      data: {
        analystConsensus: {
          currentPrice: 1187,
          targetHighPrice: 1400,
          targetLowPrice: 900,
          targetMeanPrice: 1200,
          targetMedianPrice: 1210,
          recommendationMean: 2,
          recommendationKey: "buy",
          numberOfAnalystOpinions: 12
        }
      }
    });
    yahooService.news = async () => ({ data: [] });
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "tester", password: "correct horse battery staple", confirmPassword: "correct horse battery staple" })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";

        addTracked("AAA.PA", "AAA", "Paris");
        const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
        db.prepare("INSERT INTO asset_market_snapshots (asset_id, market_state, last_price, currency, exchange, source, updated_at) VALUES (?, 'POSTPOST', 1187, 'EUR', 'Paris', 'seed', CURRENT_TIMESTAMP)").run(asset.id);

        let batchCalls = 0;
        let singleQuoteCalls = 0;
        yahooApi.quoteBatchRaw = async (symbols) => {
          batchCalls += 1;
          return symbols.map((symbol) => pricedQuoteRow(symbol, "POSTPOST", 1305));
        };
        yahooApi.quote = async (symbol) => {
          singleQuoteCalls += 1;
          return pricedQuoteRow(symbol, "POSTPOST", 1187);
        };

        const group = trackedMarketRepository.syncFromTrackedAssets().get("euronextParis");
        await marketCloseTask.run(group, new Date("2026-05-06T15:50:00.000Z"));
        await new Promise((resolve) => setTimeout(resolve, 50));

        const dbSnapshot = db.prepare("SELECT market_state, last_price, day_change, day_change_percent, previous_close, open_price, day_high, day_low, volume, bid_price, ask_price, regular_market_time, average_volume_3m FROM asset_market_snapshots WHERE asset_id = ?").get(asset.id);
        const quote = await marketSnapshotService.getQuote("AAA.PA");
        const response = await fetch(\`\${baseUrl}/api/assets/AAA.PA?range=1d\`, { headers: { Cookie: cookie } });
        const body = await response.json();
        const afterRoute = db.prepare("SELECT market_state, last_price, day_change, day_change_percent, previous_close, open_price, day_high, day_low, volume, bid_price, ask_price, regular_market_time, average_volume_3m FROM asset_market_snapshots WHERE asset_id = ?").get(asset.id);

        console.log("__RESULT__" + JSON.stringify({
          batchCalls,
          singleQuoteCalls,
          status: response.status,
          dbSnapshot,
          quote,
          routeQuotePrice: body.quote?.price,
          routeMarketInfoPrice: body.marketInfo?.regularMarketPrice,
          routeMarketState: body.marketInfo?.marketState,
          routeMarketInfo: body.marketInfo,
          analystCurrentPrice: body.analystConsensus?.currentPrice,
          afterRoute
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 200);
  assert.equal(result.batchCalls, 1);
  assert.equal(result.singleQuoteCalls, 0);
  assert.equal(result.dbSnapshot.market_state, "POSTPOST");
  assert.equal(result.dbSnapshot.last_price, 1305);
  assert.equal(result.dbSnapshot.day_change, 118);
  assert.equal(result.dbSnapshot.day_change_percent, 9.94);
  assert.equal(result.dbSnapshot.previous_close, 1000);
  assert.equal(result.dbSnapshot.open_price, 1190);
  assert.equal(result.dbSnapshot.day_high, 1310);
  assert.equal(result.dbSnapshot.day_low, 1175);
  assert.equal(result.dbSnapshot.volume, 1234567);
  assert.equal(result.dbSnapshot.bid_price, 1304.5);
  assert.equal(result.dbSnapshot.ask_price, 1305.5);
  assert.equal(result.dbSnapshot.regular_market_time, "2026-05-06T15:45:00.000Z");
  assert.equal(result.dbSnapshot.average_volume_3m, 7654321);
  assert.equal(result.quote.price, 1305);
  assert.equal(result.routeQuotePrice, 1305);
  assert.equal(result.routeMarketInfoPrice, 1305);
  assert.equal(result.routeMarketState, "POST");
  assert.equal(result.routeMarketInfo.regularMarketChange, 118);
  assert.equal(result.routeMarketInfo.regularMarketChangePercent, 9.94);
  assert.equal(result.routeMarketInfo.regularMarketPreviousClose, 1000);
  assert.equal(result.routeMarketInfo.regularMarketOpen, 1190);
  assert.equal(result.routeMarketInfo.regularMarketDayHigh, 1310);
  assert.equal(result.routeMarketInfo.regularMarketDayLow, 1175);
  assert.equal(result.routeMarketInfo.regularMarketVolume, 1234567);
  assert.equal(result.routeMarketInfo.bid, 1304.5);
  assert.equal(result.routeMarketInfo.ask, 1305.5);
  assert.equal(result.routeMarketInfo.regularMarketTime, "2026-05-06T15:45:00.000Z");
  assert.equal(result.analystCurrentPrice, 1305);
  assert.equal(result.afterRoute.last_price, 1305);
});

test("snapshot upsert keeps useful existing values when Yahoo returns null fields", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { marketSnapshotService } from "./services/market/market-snapshot.service.ts";
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
    marketSnapshotService.upsertSnapshot(asset.id, pricedQuoteRow("AAA.PA", "POSTPOST", 1305).snapshot);
    db.prepare("UPDATE asset_market_snapshots SET updated_at = '2026-05-06T15:45:00.000Z' WHERE asset_id = ?").run(asset.id);
    marketSnapshotService.upsertSnapshot(asset.id, {
      symbol: "AAA.PA",
      marketState: "POSTPOST",
      regularMarketPrice: null,
      regularMarketChange: null,
      regularMarketChangePercent: null,
      regularMarketPreviousClose: null,
      regularMarketOpen: null,
      regularMarketDayHigh: null,
      regularMarketDayLow: null,
      regularMarketVolume: null,
      bid: null,
      ask: null,
      bidSize: null,
      askSize: null,
      averageDailyVolume3Month: null,
      currency: null,
      exchange: null,
      fullExchangeName: null,
      quoteType: null,
      regularMarketTime: null
    });
    const row = db.prepare("SELECT market_state, last_price, day_change, day_change_percent, previous_close, open_price, day_high, day_low, volume, bid_price, ask_price, regular_market_time, average_volume_3m, updated_at FROM asset_market_snapshots WHERE asset_id = ?").get(asset.id);
    console.log("__RESULT__" + JSON.stringify(row));
  `);

  assert.equal(result.market_state, "POSTPOST");
  assert.equal(result.last_price, 1305);
  assert.equal(result.day_change, 118);
  assert.equal(result.day_change_percent, 9.94);
  assert.equal(result.previous_close, 1000);
  assert.equal(result.open_price, 1190);
  assert.equal(result.day_high, 1310);
  assert.equal(result.day_low, 1175);
  assert.equal(result.volume, 1234567);
  assert.equal(result.bid_price, 1304.5);
  assert.equal(result.ask_price, 1305.5);
  assert.equal(result.regular_market_time, "2026-05-06T15:45:00.000Z");
  assert.equal(result.average_volume_3m, 7654321);
  assert.equal(result.updated_at, "2026-05-06T15:45:00.000Z");
});

test("market snapshot dto does not convert missing numeric fields to zero", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { marketSnapshotService } from "./services/market/market-snapshot.service.ts";
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
    db.prepare("INSERT INTO asset_market_snapshots (asset_id, market_state, source, updated_at) VALUES (?, 'POSTPOST', 'seed', '2026-05-06T15:45:00.000Z')").run(asset.id);
    const dto = marketSnapshotService.readMarketDto("AAA.PA");
    console.log("__RESULT__" + JSON.stringify({
      dayChange: dto.dayChange,
      dayChangePercent: dto.dayChangePercent,
      volume: dto.volume
    }));
  `);

  assert.equal(result.dayChange, undefined);
  assert.equal(result.dayChangePercent, undefined);
  assert.equal(result.volume, undefined);
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

test("live refresh disabled preserves current behavior and does not call Yahoo", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "false";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { marketSnapshotService } = await import("./services/market/market-snapshot.service.ts");
    const { trackedMarketRepository } = await import("./services/tache_auto/tracked-market.repository.ts");
    const { marketRunRepository } = await import("./services/tache_auto/market-run.repository.ts");
    const { LiveMarketRefreshTask } = await import("./services/tache_auto/live-market-refresh.task.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    let calls = 0;
    yahooApi.quoteBatchRaw = async (symbols) => { calls += 1; return symbols.map((symbol) => quoteRow(symbol, "REGULAR")); };
    const groups = trackedMarketRepository.syncFromTrackedAssets();
    const group = groups.get("euronextParis");
    const run = marketRunRepository.ensure({
      marketKey: group.marketKey,
      tradingDate: "2026-05-06",
      timezone: group.calendar.timezone,
      assetsCount: group.assets.length,
      openExpectedAt: new Date("2026-05-06T07:00:00.000Z"),
      closeExpectedAt: new Date("2026-05-06T15:30:00.000Z")
    });
    marketRunRepository.updateOpen(run.id, { open_status: "confirmed_open", open_confirmed_at: "2026-05-06T07:00:00.000Z" });
    const outcome = await new LiveMarketRefreshTask().run(groups.values(), new Date("2026-05-06T12:00:00.000Z"));
    console.log("__RESULT__" + JSON.stringify({ calls, outcome }));
  `);

  assert.equal(result.calls, 0);
  assert.equal(result.outcome.enabled, false);
});

test("live refresh merges eligible multi-market symbols into one Yahoo batch", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    process.env.MARKET_LIVE_REFRESH_INTERVAL_MS = "300000";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { marketSnapshotService } = await import("./services/market/market-snapshot.service.ts");
    const { trackedMarketRepository } = await import("./services/tache_auto/tracked-market.repository.ts");
    const { marketRunRepository } = await import("./services/tache_auto/market-run.repository.ts");
    const { LiveMarketRefreshTask } = await import("./services/tache_auto/live-market-refresh.task.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    addTracked("MSFT", "MSFT", "NASDAQ");
    const calls = [];
    let singleQuoteCalls = 0;
    yahooApi.quoteBatchRaw = async (symbols) => {
      calls.push([...symbols]);
      return symbols.map((symbol, index) => pricedQuoteRow(symbol, "REGULAR", 100 + index));
    };
    yahooApi.quote = async (symbol) => {
      singleQuoteCalls += 1;
      return pricedQuoteRow(symbol, "REGULAR", 999);
    };
    const groups = trackedMarketRepository.syncFromTrackedAssets();
    for (const group of groups.values()) {
      const run = marketRunRepository.ensure({
        marketKey: group.marketKey,
        tradingDate: "2026-05-06",
        timezone: group.calendar.timezone,
        assetsCount: group.assets.length,
        openExpectedAt: group.marketKey === "us" ? new Date("2026-05-06T13:30:00.000Z") : new Date("2026-05-06T07:00:00.000Z"),
        closeExpectedAt: group.marketKey === "us" ? new Date("2026-05-06T20:00:00.000Z") : new Date("2026-05-06T15:30:00.000Z")
      });
      marketRunRepository.updateOpen(run.id, { open_status: "confirmed_open", open_confirmed_at: "2026-05-06T13:00:00.000Z" });
    }
    const outcome = await new LiveMarketRefreshTask().run(groups.values(), new Date("2026-05-06T14:00:00.000Z"));
    const quote = await marketSnapshotService.getQuote("AAA.PA");
    const snapshots = db.prepare("SELECT COUNT(*) AS count FROM asset_market_snapshots").get();
    const prices = db.prepare("SELECT a.symbol, s.last_price, s.last_checked_at FROM asset_market_snapshots s JOIN assets a ON a.id = s.asset_id ORDER BY a.symbol").all();
    console.log("__RESULT__" + JSON.stringify({ calls, singleQuoteCalls, quote, outcome, snapshots, prices }));
  `);

  assert.equal(result.calls.length, 1);
  assert.deepEqual(result.calls[0].sort(), ["AAA.PA", "MSFT"]);
  assert.equal(result.singleQuoteCalls, 0);
  assert.equal(result.quote.price, 100);
  assert.equal(result.outcome.updated, 2);
  assert.equal(result.snapshots.count, 2);
  assert.ok(result.prices.every((row: any) => row.last_checked_at));
});

test("live refresh skips closed markets, lunch pauses, last close window and fresh open confirmations", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    process.env.MARKET_LIVE_REFRESH_INTERVAL_MS = "300000";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { trackedMarketRepository } = await import("./services/tache_auto/tracked-market.repository.ts");
    const { marketRunRepository } = await import("./services/tache_auto/market-run.repository.ts");
    const { LiveMarketRefreshTask } = await import("./services/tache_auto/live-market-refresh.task.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    addTracked("7203.T", "Toyota", "JPX");
    let calls = 0;
    yahooApi.quoteBatchRaw = async (symbols) => { calls += 1; return symbols.map((symbol) => quoteRow(symbol, "REGULAR")); };
    const groups = trackedMarketRepository.syncFromTrackedAssets();
    for (const group of groups.values()) {
      const run = marketRunRepository.ensure({
        marketKey: group.marketKey,
        tradingDate: group.marketKey === "tokyo" ? "2026-05-07" : "2026-05-06",
        timezone: group.calendar.timezone,
        assetsCount: group.assets.length,
        openExpectedAt: group.marketKey === "tokyo" ? new Date("2026-05-07T00:00:00.000Z") : new Date("2026-05-06T07:00:00.000Z"),
        closeExpectedAt: group.marketKey === "tokyo" ? new Date("2026-05-07T06:30:00.000Z") : new Date("2026-05-06T15:30:00.000Z")
      });
      marketRunRepository.updateOpen(run.id, { open_status: "confirmed_open", open_confirmed_at: "2026-05-06T07:00:00.000Z" });
    }
    const task = new LiveMarketRefreshTask();
    await task.run(groups.values(), new Date("2026-05-06T15:26:00.000Z"));
    await new LiveMarketRefreshTask().run(groups.values(), new Date("2026-05-07T03:00:00.000Z"));
    const parisRun = marketRunRepository.get("euronextParis", "2026-05-06");
    marketRunRepository.updateClose(parisRun.id, { close_status: "confirmed_closed", close_confirmed_at: "2026-05-06T15:45:00.000Z" });
    await new LiveMarketRefreshTask().run(groups.values(), new Date("2026-05-06T12:00:00.000Z"));
    const freshRun = marketRunRepository.ensure({
      marketKey: "euronextParis",
      tradingDate: "2026-05-08",
      timezone: "Europe/Paris",
      assetsCount: 1,
      openExpectedAt: new Date("2026-05-08T07:00:00.000Z"),
      closeExpectedAt: new Date("2026-05-08T15:30:00.000Z")
    });
    marketRunRepository.updateOpen(freshRun.id, { open_status: "confirmed_open", open_confirmed_at: "2026-05-08T07:01:00.000Z" });
    await new LiveMarketRefreshTask().run(groups.values(), new Date("2026-05-08T07:02:00.000Z"));
    console.log("__RESULT__" + JSON.stringify({ calls }));
  `);

  assert.equal(result.calls, 0);
});

test("live refresh falls back by market when global Yahoo batch fails", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    process.env.MARKET_LIVE_REFRESH_INTERVAL_MS = "300000";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { trackedMarketRepository } = await import("./services/tache_auto/tracked-market.repository.ts");
    const { marketRunRepository } = await import("./services/tache_auto/market-run.repository.ts");
    const { LiveMarketRefreshTask } = await import("./services/tache_auto/live-market-refresh.task.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    addTracked("MSFT", "MSFT", "NASDAQ");
    const calls = [];
    yahooApi.quoteBatchRaw = async (symbols) => {
      calls.push([...symbols]);
      if (symbols.length > 1) throw new Error("multi-market unsupported");
      return symbols.map((symbol) => quoteRow(symbol, "REGULAR"));
    };
    const groups = trackedMarketRepository.syncFromTrackedAssets();
    for (const group of groups.values()) {
      const run = marketRunRepository.ensure({
        marketKey: group.marketKey,
        tradingDate: "2026-05-06",
        timezone: group.calendar.timezone,
        assetsCount: group.assets.length,
        openExpectedAt: group.marketKey === "us" ? new Date("2026-05-06T13:30:00.000Z") : new Date("2026-05-06T07:00:00.000Z"),
        closeExpectedAt: group.marketKey === "us" ? new Date("2026-05-06T20:00:00.000Z") : new Date("2026-05-06T15:30:00.000Z")
      });
      marketRunRepository.updateOpen(run.id, { open_status: "confirmed_open", open_confirmed_at: "2026-05-06T13:00:00.000Z" });
    }
    const outcome = await new LiveMarketRefreshTask().run(groups.values(), new Date("2026-05-06T14:00:00.000Z"));
    console.log("__RESULT__" + JSON.stringify({ calls, outcome }));
  `);

  assert.equal(result.calls.length, 3);
  assert.equal(result.calls[0].length, 2);
  assert.deepEqual(result.calls.slice(1).map((call: string[]) => call.length), [1, 1]);
  assert.equal(result.outcome.updated, 2);
});

test("market SSE endpoint is authenticated and controlled by env flag", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_SSE = "false";
    const { app } = await import("./app.ts");

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "tester", password: "correct horse battery staple", confirmPassword: "correct horse battery staple" })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const unauthorized = await fetch(\`\${baseUrl}/api/market/events\`);
        const disabled = await fetch(\`\${baseUrl}/api/market/events\`, { headers: { Cookie: cookie } });
        const features = await fetch(\`\${baseUrl}/api/market/features\`, { headers: { Cookie: cookie } }).then((response) => response.json());
        console.log("__RESULT__" + JSON.stringify({ unauthorized: unauthorized.status, disabled: disabled.status, features }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.unauthorized, 401);
  assert.equal(result.disabled, 404);
  assert.equal(result.features.sseEnabled, false);
});

test("live refresh mode serves dashboard assets analysis and dividends from cache without Yahoo on navigation", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    process.env.MARKET_LIVE_REFRESH_INTERVAL_MS = "300000";
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { yahooService } = await import("./services/yahoo/index.ts");
    ${helpers}

    const calls = { quote: 0, quoteBatchRaw: 0, chart: 0, quoteSummary: 0, fundamentals: 0, marketInfo: 0, extraData: 0, news: 0 };
    yahooApi.quote = async (symbol) => { calls.quote += 1; return pricedQuoteRow(symbol, "REGULAR", 999); };
    yahooApi.quoteBatchRaw = async (symbols) => { calls.quoteBatchRaw += 1; return symbols.map((symbol) => pricedQuoteRow(symbol, "REGULAR", 999)); };
    yahooApi.chart = async () => { calls.chart += 1; return { quotes: [], dividends: [], splits: [] }; };
    yahooApi.quoteSummary = async () => { calls.quoteSummary += 1; return { profile: {}, raw: {} }; };
    yahooService.fundamentals = async () => { calls.fundamentals += 1; return { data: {}, stale: false }; };
    yahooService.marketInfo = async () => { calls.marketInfo += 1; return { data: {} }; };
    yahooService.extraData = async () => { calls.extraData += 1; return { data: {} }; };
    yahooService.news = async () => { calls.news += 1; return { data: [] }; };

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "tester", password: "correct horse battery staple", confirmPassword: "correct horse battery staple" })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";

        addTracked("AAA.PA", "AAA", "Paris");
        const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
        db.prepare(
          "INSERT INTO asset_market_snapshots (asset_id, market_state, last_price, day_change, day_change_percent, previous_close, currency, exchange, source, last_checked_at, updated_at) VALUES (?, 'REGULAR', 123, 1, 0.82, 122, 'EUR', 'Paris', 'seed', ?, ?)"
        ).run(asset.id, new Date().toISOString(), new Date().toISOString());
        db.prepare(
          "INSERT INTO chart_candles_1d (asset_id, interval, datetime_start, datetime_end, open, high, low, close, source) VALUES (?, '5m', '2026-05-06T07:00:00.000Z', '2026-05-06T07:05:00.000Z', 122, 123, 122, 122.5, 'seed'), (?, '5m', '2026-05-06T07:05:00.000Z', '2026-05-06T07:10:00.000Z', 122.5, 123, 122.5, 123, 'seed')"
        ).run(asset.id, asset.id);

        const now = Date.now();
        const expiresAt = now + 300000;
        const summary = {
          totalValue: 123,
          totalCost: 10,
          totalDividendsReceived: 0,
          totalFees: 0,
          totalPerformance: 113,
          totalPerformancePercent: 1130,
          positionsCount: 1,
          assetsCount: 1,
          currency: "EUR",
          positions: [{
            id: 1,
            symbol: "AAA.PA",
            name: "AAA",
            quantity: 1,
            averageBuyPrice: 10,
            currency: "EUR",
            currentPrice: 123,
            marketValue: 123,
            costBasis: 10,
            performance: 113,
            performancePercent: 1130,
            quote: { symbol: "AAA.PA", name: "AAA", price: 123, currency: "EUR", marketState: "REGULAR" }
          }]
        };
        const chart = {
          userId: "1",
          range: "intraday",
          timestamps: [new Date("2026-05-06T07:00:00.000Z").getTime(), new Date("2026-05-06T07:05:00.000Z").getTime()],
          value: [122.5, 123],
          invested: [10, 10],
          gain: [112.5, 113],
          gainPercent: [1125, 1130],
          cachedAt: now,
          expiresAt,
          transactionMarkers: []
        };
        const analysis = { countryAllocation: [], sectorAllocation: [], treemap: [], netMargins: [], financials: [], financialsByAsset: [], stale: false };
        const dividends = { annualEstimatedTotal: 0, currency: "EUR", months: [], upcoming: [], past: [], stale: false };
        const writeBlock = (block, range, payload) => db.prepare("INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at) VALUES (?, '1', ?, ?, ?, ?, ?)")
          .run(\`1:\${block}:\${range ?? "default"}\`, block, range ?? null, JSON.stringify(payload), now, expiresAt);
        writeBlock("portfolio-summary", "1d", summary);
        writeBlock("analysis", null, analysis);
        writeBlock("dividends", null, dividends);
        db.prepare("INSERT INTO portfolio_chart_cache (cache_key, user_id, range, payload, cached_at, expires_at) VALUES ('1:1d', '1', '1d', ?, ?, ?)")
          .run(JSON.stringify(chart), now, expiresAt);

        const responses = [];
        for (const path of ["/api/portfolio/full?range=1d", "/api/assets/AAA.PA?range=1d", "/api/portfolio/analysis", "/api/portfolio/dividends"]) {
          const response = await fetch(\`\${baseUrl}\${path}\`, { headers: { Cookie: cookie } });
          responses.push({ path, status: response.status });
          await response.json();
        }
        console.log("__RESULT__" + JSON.stringify({ calls, responses }));
      } finally {
        server.close();
      }
    });
  `);

  assert.ok(result.responses.every((response: any) => response.status === 200), JSON.stringify(result.responses));
  assert.deepEqual(result.calls, { quote: 0, quoteBatchRaw: 0, chart: 0, quoteSummary: 0, fundamentals: 0, marketInfo: 0, extraData: 0, news: 0 });
});
