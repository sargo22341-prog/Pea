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
