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
      averageDailyVolume10Day: 2345678,
      fiftyTwoWeekLow: 49.24,
      fiftyTwoWeekHigh: 81.34,
      fiftyTwoWeekChangePercent: 42.83023,
      exDividendDate: "2026-06-30T00:00:00.000Z",
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
    process.env.ENABLE_MARKET_LIVE_REFRESH = "false";
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { yahooService } = await import("./services/yahoo/index.ts");
    const { trackedMarketRepository } = await import("./services/tache_auto/tracked-market.repository.ts");
    const { marketCloseTask } = await import("./services/tache_auto/market-close.task.ts");
    const { marketSnapshotService } = await import("./services/market/market-snapshot.service.ts");
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

        const dbSnapshot = db.prepare("SELECT market_state, last_price, day_change, day_change_percent, previous_close, open_price, day_high, day_low, volume, bid_price, ask_price, regular_market_time, average_volume_3m, average_volume_10d, fifty_two_week_low, fifty_two_week_high, fifty_two_week_change_percent, ex_dividend_date FROM asset_market_snapshots WHERE asset_id = ?").get(asset.id);
        const quote = await marketSnapshotService.getQuote("AAA.PA");
        const response = await fetch(\`\${baseUrl}/api/assets/AAA.PA?range=1d\`, { headers: { Cookie: cookie } });
        const body = await response.json();
        const afterRoute = db.prepare("SELECT market_state, last_price, day_change, day_change_percent, previous_close, open_price, day_high, day_low, volume, bid_price, ask_price, regular_market_time, average_volume_3m, average_volume_10d, fifty_two_week_low, fifty_two_week_high, fifty_two_week_change_percent, ex_dividend_date FROM asset_market_snapshots WHERE asset_id = ?").get(asset.id);

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
  assert.equal(result.dbSnapshot.average_volume_10d, 2345678);
  assert.equal(result.dbSnapshot.fifty_two_week_low, 49.24);
  assert.equal(result.dbSnapshot.fifty_two_week_high, 81.34);
  assert.equal(result.dbSnapshot.fifty_two_week_change_percent, 42.83023);
  assert.equal(result.dbSnapshot.ex_dividend_date, "2026-06-30T00:00:00.000Z");
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
  assert.equal(result.routeMarketInfo.averageDailyVolume3Month, 7654321);
  assert.equal(result.routeMarketInfo.fiftyTwoWeekLow, 49.24);
  assert.equal(result.routeMarketInfo.fiftyTwoWeekHigh, 81.34);
  assert.equal(result.routeMarketInfo.exDividendDate, "2026-06-30T00:00:00.000Z");
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
      averageDailyVolume10Day: null,
      fiftyTwoWeekLow: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekChangePercent: null,
      exDividendDate: null,
      currency: null,
      exchange: null,
      fullExchangeName: null,
      quoteType: null,
      regularMarketTime: null
    });
    const row = db.prepare("SELECT market_state, last_price, day_change, day_change_percent, previous_close, open_price, day_high, day_low, volume, bid_price, ask_price, regular_market_time, average_volume_3m, average_volume_10d, fifty_two_week_low, fifty_two_week_high, fifty_two_week_change_percent, ex_dividend_date, updated_at FROM asset_market_snapshots WHERE asset_id = ?").get(asset.id);
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
  assert.equal(result.average_volume_10d, 2345678);
  assert.equal(result.fifty_two_week_low, 49.24);
  assert.equal(result.fifty_two_week_high, 81.34);
  assert.equal(result.fifty_two_week_change_percent, 42.83023);
  assert.equal(result.ex_dividend_date, "2026-06-30T00:00:00.000Z");
  assert.equal(result.updated_at, "2026-05-06T15:45:00.000Z");
});

test("marketInfo from quoteSummary replaces missing slow snapshot fields and preserves them against n/a", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { marketSnapshotService } from "./services/market/market-snapshot.service.ts";
    ${seedUser}
    ${helpers}
    addTracked("TTE.PA", "TotalEnergies", "Paris");
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'TTE.PA'").get();
    db.prepare("INSERT INTO asset_market_snapshots (asset_id, market_state, source, updated_at) VALUES (?, 'POSTPOST', 'seed', '2026-05-06T15:45:00.000Z')").run(asset.id);
    marketSnapshotService.upsertMarketInfo(asset.id, {
      fiftyTwoWeekLow: 49.24,
      fiftyTwoWeekHigh: 81.34,
      averageDailyVolume3Month: 6128825,
      exDividendDate: "2026-06-30T00:00:00.000Z",
      dividendRate: 3.16,
      dividendYield: 0.05
    });
    marketSnapshotService.upsertMarketInfo(asset.id, {
      fiftyTwoWeekLow: undefined,
      fiftyTwoWeekHigh: undefined,
      averageDailyVolume3Month: undefined,
      exDividendDate: undefined,
      dividendRate: undefined,
      dividendYield: undefined
    });
    const dto = marketSnapshotService.readMarketDto("TTE.PA");
    const row = db.prepare("SELECT average_volume_3m, fifty_two_week_low, fifty_two_week_high, ex_dividend_date FROM asset_market_snapshots WHERE asset_id = ?").get(asset.id);
    console.log("__RESULT__" + JSON.stringify({ dto, row }));
  `);

  assert.equal(result.row.average_volume_3m, 6128825);
  assert.equal(result.row.fifty_two_week_low, 49.24);
  assert.equal(result.row.fifty_two_week_high, 81.34);
  assert.equal(result.row.ex_dividend_date, "2026-06-30T00:00:00.000Z");
  assert.equal(result.dto.avgVolume3M, 6128825);
  assert.equal(result.dto.week52Low, 49.24);
  assert.equal(result.dto.week52High, 81.34);
  assert.equal(result.dto.exDividendDate, "2026-06-30T00:00:00.000Z");
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
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });
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

test("live refresh ne marque le cycle reussi qu'apres succes et retente apres backoff court", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { trackedMarketRepository } = await import("./services/tache_auto/tracked-market.repository.ts");
    const { LiveMarketRefreshTask } = await import("./services/tache_auto/live-market-refresh.task.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const groups = trackedMarketRepository.syncFromTrackedAssets();
    db.prepare("INSERT INTO market_daily_runs (market_key, trading_date, timezone, open_expected_at, open_status, open_confirmed_at, close_expected_at, close_status, assets_count, created_at, updated_at) VALUES ('euronextParis', '2026-05-06', 'Europe/Paris', '2026-05-06T07:00:00.000Z', 'confirmed_open', '2026-05-06T07:01:00.000Z', '2026-05-06T15:30:00.000Z', 'pending', 1, '2026-05-06T07:00:00.000Z', '2026-05-06T07:00:00.000Z')").run();
    let calls = 0;
    yahooApi.quoteBatchRaw = async () => {
      calls += 1;
      throw new Error("Yahoo down");
    };
    const task = new LiveMarketRefreshTask();
    const first = await task.run(groups.values(), new Date("2026-05-06T08:00:00.000Z")).catch((error) => ({ failed: true, message: error.message }));
    const second = await task.run(groups.values(), new Date("2026-05-06T08:00:10.000Z")).catch((error) => ({ failed: true, message: error.message }));
    const third = await task.run(groups.values(), new Date("2026-05-06T08:00:31.000Z")).catch((error) => ({ failed: true, message: error.message }));
    console.log("__RESULT__" + JSON.stringify({ calls, first, second, third }));
  `);

  assert.equal(result.calls, 4);
  assert.equal(result.first.failed, true);
  assert.equal(result.second.skipped, "backoff");
  assert.equal(result.third.failed, true);
});

test("live refresh succes met a jour l'intervalle de succes", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { trackedMarketRepository } = await import("./services/tache_auto/tracked-market.repository.ts");
    const { LiveMarketRefreshTask } = await import("./services/tache_auto/live-market-refresh.task.ts");
    const { marketDataService } = await import("./services/market/market-data.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const groups = trackedMarketRepository.syncFromTrackedAssets();
    db.prepare("INSERT INTO market_daily_runs (market_key, trading_date, timezone, open_expected_at, open_status, open_confirmed_at, close_expected_at, close_status, assets_count, created_at, updated_at) VALUES ('euronextParis', '2026-05-06', 'Europe/Paris', '2026-05-06T07:00:00.000Z', 'confirmed_open', '2026-05-06T07:01:00.000Z', '2026-05-06T15:30:00.000Z', 'pending', 1, '2026-05-06T07:00:00.000Z', '2026-05-06T07:00:00.000Z')").run();
    let calls = 0;
    yahooApi.quoteBatchRaw = async (symbols) => {
      calls += 1;
      return symbols.map((symbol) => pricedQuoteRow(symbol, "REGULAR", 123));
    };
    yahooApi.quote = async (symbol) => pricedQuoteRow(symbol, "REGULAR", 123);
    marketDataService.refreshLiveIntradayForAssets = async () => ({ updated: 0, yahooCalls: 0 });
    const task = new LiveMarketRefreshTask();
    task.prewarmFrontendBlocks = async () => undefined;
    const first = await task.run(groups.values(), new Date("2026-05-06T08:00:00.000Z"));
    const second = await task.run(groups.values(), new Date("2026-05-06T08:01:00.000Z"));
    console.log("__RESULT__" + JSON.stringify({ calls, first, second }));
  `);

  assert.equal(result.calls, 1);
  assert.equal(result.first.updated, 1);
  assert.equal(result.second.skipped, "interval");
});

test("live refresh skips closed markets, lunch pauses, last close window and fresh open confirmations", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
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
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });
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

test("live refresh prewarms intraday charts only for portfolio assets", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { trackedMarketRepository } = await import("./services/tache_auto/tracked-market.repository.ts");
    const { marketRunRepository } = await import("./services/tache_auto/market-run.repository.ts");
    const { LiveMarketRefreshTask } = await import("./services/tache_auto/live-market-refresh.task.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES ('BBB.PA', 'BBB', 'Paris', 'EUR')").run();
    db.prepare("INSERT INTO watchlist (user_id, symbol, name, exchange, currency) VALUES (1, 'BBB.PA', 'BBB', 'Paris', 'EUR')").run();
    const quoteCalls = [];
    const chartCalls = [];
    yahooApi.quoteBatchRaw = async (symbols) => {
      quoteCalls.push([...symbols]);
      return symbols.map((symbol, index) => pricedQuoteRow(symbol, "REGULAR", 100 + index));
    };
    yahooApi.chart = async (symbol) => {
      chartCalls.push(symbol);
      return {
        quotes: [
          { date: "2026-05-06T12:00:00.000Z", open: 100, high: 101, low: 99, close: 100, volume: 1000 },
          { date: "2026-05-06T12:05:00.000Z", open: 100, high: 102, low: 100, close: 101, volume: 1200 }
        ],
        dividends: [],
        splits: []
      };
    };
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
    const task = new LiveMarketRefreshTask();
    await task.run(groups.values(), new Date("2026-05-06T12:00:00.000Z"));
    await task.run(groups.values(), new Date("2026-05-06T12:06:00.000Z"));
    const candles = db.prepare("SELECT a.symbol, COUNT(*) AS count FROM chart_candles_1d c JOIN assets a ON a.id = c.asset_id GROUP BY a.symbol ORDER BY a.symbol").all();
    console.log("__RESULT__" + JSON.stringify({ quoteCalls, chartCalls, candles }));
  `);

  assert.equal(result.quoteCalls.length, 2);
  assert.deepEqual(result.quoteCalls[0].sort(), ["AAA.PA", "BBB.PA"]);
  assert.deepEqual(result.chartCalls, ["AAA.PA"]);
  assert.deepEqual(result.candles, [{ symbol: "AAA.PA", count: 2 }]);
});

test("lazy chart refresh is stale-while-revalidate and dedupes in-flight refreshes", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    ${helpers}
    let chartCalls = 0;
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    yahooApi.chart = async () => {
      chartCalls += 1;
      await pending;
      return {
        quotes: [
          { date: "2026-05-06T12:00:00.000Z", open: 100, high: 101, low: 99, close: 100, volume: 1000 },
          { date: "2026-05-06T12:05:00.000Z", open: 100, high: 102, low: 100, close: 101, volume: 1200 }
        ],
        dividends: [],
        splits: []
      };
    };

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

        const startedAt = Date.now();
        const first = await fetch(\`\${baseUrl}/api/market/chart-refresh\`, {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "asset", symbol: "AAA.PA", range: "1d" })
        });
        const firstDurationMs = Date.now() - startedAt;
        const second = await fetch(\`\${baseUrl}/api/market/chart-refresh\`, {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "asset", symbol: "AAA.PA", range: "1d" })
        });
        const firstBody = await first.json();
        const secondBody = await second.json();
        release();
        await new Promise((resolve) => setTimeout(resolve, 30));
        console.log("__RESULT__" + JSON.stringify({ firstStatus: first.status, secondStatus: second.status, firstBody, secondBody, chartCalls, firstDurationMs }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.firstStatus, 202);
  assert.equal(result.firstBody.status, "started");
  assert.equal(result.secondStatus, 200);
  assert.equal(result.secondBody.status, "in-progress");
  assert.equal(result.chartCalls, 1);
  assert.ok(result.firstDurationMs < 100, `route bloquante: ${result.firstDurationMs}ms`);
});

test("lazy chart refresh is skipped while cache is fresh", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { chartRefreshService } = await import("./services/market/chart-refresh.service.ts");
    const { getMarketCalendar } = await import("./services/market/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./services/tache_auto/market-run.repository.ts");
    const { localTradingDate } = await import("./services/tache_auto/market-task.utils.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const calendar = getMarketCalendar("AAA.PA", "Paris");
    const local = localTradingDate(new Date(), calendar.timezone);
    const run = marketRunRepository.ensure({ marketKey: calendar.market, tradingDate: local.isoDate, timezone: calendar.timezone, assetsCount: 1 });
    marketRunRepository.updateOpen(run.id, { open_status: "confirmed_open", open_confirmed_at: new Date().toISOString() });
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
    const start = new Date(Date.now() - 60_000);
    const end = new Date(start.getTime() + 5 * 60_000);
    db.prepare(
      "INSERT INTO chart_candles_1d (asset_id, interval, datetime_start, datetime_end, open, high, low, close, source, updated_at) VALUES (?, '5m', ?, ?, 100, 101, 99, 100, 'seed', ?)"
    ).run(asset.id, start.toISOString(), end.toISOString(), new Date().toISOString());
    let chartCalls = 0;
    yahooApi.chart = async () => { chartCalls += 1; return { quotes: [], dividends: [], splits: [] }; };
    const fresh = chartRefreshService.requestAssetRefresh({ userId: 1, symbol: "AAA.PA", range: "1d", scope: "asset" });
    console.log("__RESULT__" + JSON.stringify({ fresh, chartCalls }));
  `);

  assert.equal(result.fresh.status, "skipped-fresh");
  assert.equal(result.chartCalls, 0);
});

test("lazy chart refresh skips Yahoo while market open status is pending", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { chartRefreshService } = await import("./services/market/chart-refresh.service.ts");
    const { getMarketCalendar } = await import("./services/market/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./services/tache_auto/market-run.repository.ts");
    const { localTradingDate } = await import("./services/tache_auto/market-task.utils.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const calendar = getMarketCalendar("AAA.PA", "Paris");
    const local = localTradingDate(new Date(), calendar.timezone);
    marketRunRepository.ensure({ marketKey: calendar.market, tradingDate: local.isoDate, timezone: calendar.timezone, assetsCount: 1 });
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
    db.prepare(
      "INSERT INTO chart_candles_1d (asset_id, interval, datetime_start, datetime_end, open, high, low, close, source) VALUES (?, '5m', '2026-05-06T07:00:00.000Z', '2026-05-06T07:05:00.000Z', 100, 101, 99, 100, 'seed')"
    ).run(asset.id);
    let chartCalls = 0;
    yahooApi.chart = async () => { chartCalls += 1; return { quotes: [], dividends: [], splits: [] }; };
    const refresh = chartRefreshService.requestAssetRefresh({ userId: 1, symbol: "AAA.PA", range: "1d", scope: "asset" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    console.log("__RESULT__" + JSON.stringify({ refresh, chartCalls }));
  `);

  assert.equal(result.refresh.status, "skipped-market-closed");
  assert.equal(result.chartCalls, 0);
});

test("lazy chart refresh initializes an unknown comparison symbol once", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { chartRefreshService } = await import("./services/market/chart-refresh.service.ts");
    ${seedUser}
    ${helpers}
    let quoteCalls = 0;
    let chartCalls = 0;
    yahooApi.quote = async (symbol) => { quoteCalls += 1; return quoteRow(symbol, "CLOSED"); };
    yahooApi.quoteSummary = async () => ({ profile: {}, raw: {} });
    yahooApi.chart = async () => {
      chartCalls += 1;
      return { quotes: [
        { date: "2026-05-06T07:00:00.000Z", open: 100, high: 101, low: 99, close: 100 },
        { date: "2026-05-06T07:05:00.000Z", open: 100, high: 102, low: 100, close: 101 }
      ], dividends: [], splits: [] };
    };
    const refresh = await chartRefreshService.requestAssetRefreshWithInitialization({ userId: 1, symbol: "URTH", range: "1d", scope: "asset" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const asset = db.prepare("SELECT symbol FROM assets WHERE symbol = 'URTH'").get();
    const candles = db.prepare("SELECT COUNT(*) AS count FROM chart_candles_1d c JOIN assets a ON a.id = c.asset_id WHERE a.symbol = 'URTH'").get();
    console.log("__RESULT__" + JSON.stringify({ refresh, quoteCalls, chartCalls, asset, candles }));
  `);

  assert.equal(result.refresh.status, "started");
  assert.ok(result.quoteCalls >= 1);
  assert.equal(result.chartCalls, 1);
  assert.equal(result.asset.symbol, "URTH");
  assert.equal(result.candles.count, 2);
});

test("lazy chart refresh uses configured 1d interval instead of ratio threshold", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { chartRefreshService } = await import("./services/market/chart-refresh.service.ts");
    const { getMarketCalendar } = await import("./services/market/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./services/tache_auto/market-run.repository.ts");
    const { localTradingDate } = await import("./services/tache_auto/market-task.utils.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const calendar = getMarketCalendar("AAA.PA", "Paris");
    const local = localTradingDate(new Date(), calendar.timezone);
    const run = marketRunRepository.ensure({ marketKey: calendar.market, tradingDate: local.isoDate, timezone: calendar.timezone, assetsCount: 1 });
    marketRunRepository.updateOpen(run.id, { open_status: "confirmed_open", open_confirmed_at: new Date().toISOString() });
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
    const start = new Date(Date.now() - 6 * 60_000);
    const end = new Date(start.getTime() + 5 * 60_000);
    db.prepare(
      "INSERT INTO chart_candles_1d (asset_id, interval, datetime_start, datetime_end, open, high, low, close, source) VALUES (?, '5m', ?, ?, 100, 101, 99, 100, 'seed')"
    ).run(asset.id, start.toISOString(), end.toISOString());
    let chartCalls = 0;
    yahooApi.chart = async () => {
      chartCalls += 1;
      return { quotes: [
        { date: start.toISOString(), open: 100, high: 101, low: 99, close: 100 },
        { date: new Date().toISOString(), open: 100, high: 102, low: 100, close: 101 }
      ], dividends: [], splits: [] };
    };
    const refresh = chartRefreshService.requestAssetRefresh({ userId: 1, symbol: "AAA.PA", range: "1d", scope: "asset" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    console.log("__RESULT__" + JSON.stringify({ refresh, chartCalls }));
  `);

  assert.equal(result.refresh.status, "started");
  assert.equal(result.chartCalls, 1);
});

test("live stored intraday with no points is not marked preparing when no refresh is launched", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { marketDataService } = await import("./services/market/market-data.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const chart = await marketDataService.getChartData("AAA.PA", "1d");
    console.log("__RESULT__" + JSON.stringify({ isPreparing: chart.isPreparing ?? false, points: chart.timestamps.length }));
  `);

  assert.equal(result.points, 0);
  assert.equal(result.isPreparing, false);
});

test("live stored intraday pending open returns temporary availability status without preparing", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { marketDataService } = await import("./services/market/market-data.service.ts");
    const { getMarketCalendar } = await import("./services/market/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./services/tache_auto/market-run.repository.ts");
    ${seedUser}
    ${helpers}
    addTracked("7203.T", "Toyota", "Tokyo");
    const calendar = getMarketCalendar("7203.T", "Tokyo");
    marketRunRepository.ensure({ marketKey: calendar.market, tradingDate: "2026-05-12", timezone: calendar.timezone, assetsCount: 1 });
    const chart = await marketDataService.getChartData("7203.T", "1d", { intradayNow: new Date("2026-05-11T23:30:00.000Z") });
    console.log("__RESULT__" + JSON.stringify({
      points: chart.timestamps.length,
      isPreparing: chart.isPreparing ?? false,
      availabilityStatus: chart.availabilityStatus
    }));
  `);

  assert.equal(result.points, 0);
  assert.equal(result.isPreparing, false);
  assert.equal(result.availabilityStatus, "pending_open_confirmation");
});

test("live stored intraday pending open still serves older candles when available", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { marketDataService } = await import("./services/market/market-data.service.ts");
    const { getMarketCalendar } = await import("./services/market/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./services/tache_auto/market-run.repository.ts");
    ${seedUser}
    ${helpers}
    addTracked("7203.T", "Toyota", "Tokyo");
    const calendar = getMarketCalendar("7203.T", "Tokyo");
    marketRunRepository.ensure({ marketKey: calendar.market, tradingDate: "2026-05-12", timezone: calendar.timezone, assetsCount: 1 });
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = '7203.T'").get();
    db.prepare(
      "INSERT INTO chart_candles_1d (asset_id, interval, datetime_start, datetime_end, open, high, low, close, source) VALUES (?, '5m', '2026-05-11T00:00:00.000Z', '2026-05-11T00:05:00.000Z', 100, 101, 99, 100, 'seed'), (?, '5m', '2026-05-11T00:05:00.000Z', '2026-05-11T00:10:00.000Z', 100, 102, 100, 101, 'seed')"
    ).run(asset.id, asset.id);
    const chart = await marketDataService.getChartData("7203.T", "1d", { intradayNow: new Date("2026-05-11T23:30:00.000Z") });
    console.log("__RESULT__" + JSON.stringify({
      points: chart.timestamps.length,
      isPreparing: chart.isPreparing ?? false,
      availabilityStatus: chart.availabilityStatus
    }));
  `);

  assert.equal(result.points, 2);
  assert.equal(result.isPreparing, false);
  assert.equal(result.availabilityStatus, undefined);
});

test("live stored non-intraday empty chart queues initial range construction", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { marketDataService } = await import("./services/market/market-data.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("URTH", "URTH", "NYSE");
    const chart = await marketDataService.getChartData("URTH", "1w");
    console.log("__RESULT__" + JSON.stringify({ isPreparing: chart.isPreparing ?? false, missingRanges: chart.missingRanges, jobId: chart.jobId ?? null }));
  `);

  assert.equal(result.isPreparing, true);
  assert.deepEqual(result.missingRanges, ["1w"]);
  assert.ok(String(result.jobId).startsWith("job-"));
});

test("dividend yield normalization accepts Yahoo fraction and percent units", () => {
  const result = runBackendScript(`
    const { normalizeDividendYield } = await import("./services/yahoo/yahoo.mapper.ts");
    console.log("__RESULT__" + JSON.stringify({
      fraction: normalizeDividendYield(0.0475),
      percent: normalizeDividendYield(4.75),
      empty: normalizeDividendYield(null),
      aberrant: normalizeDividendYield(475)
    }));
  `);

  assert.equal(result.fraction, 0.0475);
  assert.equal(result.percent, 0.0475);
  assert.equal(result.empty, null);
  assert.equal(result.aberrant, null);
});

test("lazy chart refresh returns skipped-fresh when intraday memory cache is fresh", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { marketDataService } = await import("./services/market/market-data.service.ts");
    const { chartRefreshService } = await import("./services/market/chart-refresh.service.ts");
    const { getMarketCalendar } = await import("./services/market/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./services/tache_auto/market-run.repository.ts");
    const { localTradingDate } = await import("./services/tache_auto/market-task.utils.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const calendar = getMarketCalendar("AAA.PA", "Paris");
    const local = localTradingDate(new Date(), calendar.timezone);
    const run = marketRunRepository.ensure({ marketKey: calendar.market, tradingDate: local.isoDate, timezone: calendar.timezone, assetsCount: 1 });
    marketRunRepository.updateOpen(run.id, { open_status: "confirmed_open", open_confirmed_at: new Date().toISOString() });
    const asset = db.prepare("SELECT * FROM assets WHERE symbol = 'AAA.PA'").get();
    let chartCalls = 0;
    yahooApi.chart = async () => {
      chartCalls += 1;
      return {
        quotes: [
          { date: "2026-05-06T12:00:00.000Z", open: 100, high: 101, low: 99, close: 100, volume: 1000 },
          { date: "2026-05-06T12:05:00.000Z", open: 100, high: 102, low: 100, close: 101, volume: 1200 }
        ],
        dividends: [],
        splits: []
      };
    };
    await marketDataService.refreshLiveIntradayForAsset(asset, new Date("2026-05-06T12:06:00.000Z"));
    const fresh = chartRefreshService.requestAssetRefresh({ userId: 1, symbol: "AAA.PA", range: "1d", scope: "asset" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    console.log("__RESULT__" + JSON.stringify({ fresh, chartCalls }));
  `);

  assert.equal(result.fresh.status, "skipped-fresh");
  assert.equal(result.chartCalls, 1);
});

test("lazy chart refresh stays available when live refresh mode is off", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "false";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { chartRefreshService } = await import("./services/market/chart-refresh.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    let chartCalls = 0;
    yahooApi.chart = async () => {
      chartCalls += 1;
      return {
        quotes: [
          { date: "2026-05-06T12:00:00.000Z", open: 100, high: 101, low: 99, close: 100, volume: 1000 },
          { date: "2026-05-06T12:05:00.000Z", open: 100, high: 102, low: 100, close: 101, volume: 1200 }
        ],
        dividends: [],
        splits: []
      };
    };
    const response = chartRefreshService.requestAssetRefresh({ userId: 1, symbol: "AAA.PA", range: "1d", scope: "asset" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    console.log("__RESULT__" + JSON.stringify({ response, chartCalls }));
  `);

  assert.equal(result.response.status, "started");
  assert.equal(result.chartCalls, 1);
});

test("lazy chart refresh skips closed markets with existing chart data", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { chartRefreshService } = await import("./services/market/chart-refresh.service.ts");
    const { getMarketCalendar } = await import("./services/market/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./services/tache_auto/market-run.repository.ts");
    const { localTradingDate } = await import("./services/tache_auto/market-task.utils.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
    db.prepare(
      "INSERT INTO chart_candles_1d (asset_id, interval, datetime_start, datetime_end, open, high, low, close, source, updated_at) VALUES (?, '5m', '2026-05-06T07:00:00.000Z', '2026-05-06T07:05:00.000Z', 100, 101, 99, 100, 'seed', '2026-05-06T07:05:00.000Z')"
    ).run(asset.id);
    const calendar = getMarketCalendar("AAA.PA", "Paris");
    const local = localTradingDate(new Date(), calendar.timezone);
    marketRunRepository.ensure({ marketKey: calendar.market, tradingDate: local.isoDate, timezone: calendar.timezone, assetsCount: 1, skippedWeekend: true });
    let chartCalls = 0;
    yahooApi.chart = async () => { chartCalls += 1; return { quotes: [], dividends: [], splits: [] }; };
    const response = chartRefreshService.requestAssetRefresh({ userId: 1, symbol: "AAA.PA", range: "1d", scope: "asset" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    console.log("__RESULT__" + JSON.stringify({ response, chartCalls }));
  `);

  assert.equal(result.response.status, "skipped-market-closed");
  assert.equal(result.chartCalls, 0);
});

test("lazy chart refresh allows initial chart data when market is closed", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { chartRefreshService } = await import("./services/market/chart-refresh.service.ts");
    const { getMarketCalendar } = await import("./services/market/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./services/tache_auto/market-run.repository.ts");
    const { localTradingDate } = await import("./services/tache_auto/market-task.utils.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const calendar = getMarketCalendar("AAA.PA", "Paris");
    const local = localTradingDate(new Date(), calendar.timezone);
    marketRunRepository.ensure({ marketKey: calendar.market, tradingDate: local.isoDate, timezone: calendar.timezone, assetsCount: 1, skippedWeekend: true });
    let chartCalls = 0;
    yahooApi.chart = async () => {
      chartCalls += 1;
      return {
        quotes: [
          { date: "2026-05-06T12:00:00.000Z", open: 100, high: 101, low: 99, close: 100, volume: 1000 },
          { date: "2026-05-06T12:05:00.000Z", open: 100, high: 102, low: 100, close: 101, volume: 1200 }
        ],
        dividends: [],
        splits: []
      };
    };
    const response = chartRefreshService.requestAssetRefresh({ userId: 1, symbol: "AAA.PA", range: "1d", scope: "asset" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    console.log("__RESULT__" + JSON.stringify({ response, chartCalls }));
  `);

  assert.equal(result.response.status, "started");
  assert.equal(result.chartCalls, 1);
});

test("portfolio lazy chart refresh filters by market status and initializes only missing closed-market charts", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { chartRefreshService } = await import("./services/market/chart-refresh.service.ts");
    const { getMarketCalendar } = await import("./services/market/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./services/tache_auto/market-run.repository.ts");
    const { localTradingDate } = await import("./services/tache_auto/market-task.utils.ts");
    ${seedUser}
    ${helpers}
    addTracked("PAR.PA", "Paris", "Paris");
    addTracked("MIL.MI", "Milan", "Milan");
    addTracked("AMS.AS", "Amsterdam", "Amsterdam");
    const assets = db.prepare("SELECT id, symbol, exchange FROM assets ORDER BY symbol").all();
    for (const asset of assets) {
      const calendar = getMarketCalendar(asset.symbol, asset.exchange);
      const local = localTradingDate(new Date(), calendar.timezone);
      const run = marketRunRepository.ensure({ marketKey: calendar.market, tradingDate: local.isoDate, timezone: calendar.timezone, assetsCount: 1, skippedWeekend: asset.symbol !== "AMS.AS" });
      if (asset.symbol === "AMS.AS") marketRunRepository.updateOpen(run.id, { open_status: "confirmed_open", open_confirmed_at: new Date().toISOString() });
    }
    const par = assets.find((asset) => asset.symbol === "PAR.PA");
    const mil = assets.find((asset) => asset.symbol === "MIL.MI");
    for (const asset of [par, mil]) {
      db.prepare(
        "INSERT INTO chart_candles_1d (asset_id, interval, datetime_start, datetime_end, open, high, low, close, source, updated_at) VALUES (?, '5m', '2026-05-06T07:00:00.000Z', '2026-05-06T07:05:00.000Z', 100, 101, 99, 100, 'seed', '2026-05-06T07:05:00.000Z')"
      ).run(asset.id);
    }
    const chartCalls = [];
    yahooApi.chart = async (symbol) => {
      chartCalls.push(symbol);
      return {
        quotes: [
          { date: "2026-05-06T12:00:00.000Z", open: 100, high: 101, low: 99, close: 100, volume: 1000 },
          { date: "2026-05-06T12:05:00.000Z", open: 100, high: 102, low: 100, close: 101, volume: 1200 }
        ],
        dividends: [],
        splits: []
      };
    };
    const response = chartRefreshService.requestPortfolioRefresh({ userId: 1, range: "1d" });
    await new Promise((resolve) => setTimeout(resolve, 40));
    console.log("__RESULT__" + JSON.stringify({ response, chartCalls }));
  `);

  assert.equal(result.response.status, "started");
  assert.deepEqual(result.response.symbols.sort(), ["AMS.AS"]);
  assert.deepEqual(result.chartCalls, ["AMS.AS"]);
});

test("market SSE endpoint is authenticated and always available", () => {
  const result = runBackendScript(`
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
        const controller = new AbortController();
        const enabled = await fetch(\`\${baseUrl}/api/market/events\`, { headers: { Cookie: cookie }, signal: controller.signal });
        const enabledStatus = enabled.status;
        controller.abort();
        await enabled.body?.cancel().catch(() => undefined);
        const features = await fetch(\`\${baseUrl}/api/market/features\`, { headers: { Cookie: cookie } }).then((response) => response.json());
        console.log("__RESULT__" + JSON.stringify({ unauthorized: unauthorized.status, enabled: enabledStatus, features }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.unauthorized, 401);
  assert.equal(result.enabled, 200);
  assert.equal("sseEnabled" in result.features, false);
});

test("portfolio positions performance cache hits, dedupes and invalidates on position update", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { marketDataService } = await import("./services/market/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/market-snapshot.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    let chartCalls = 0;
    let quoteCalls = 0;
    marketDataService.getChartData = async (symbol, range) => {
      chartCalls += 1;
      return {
        symbol,
        range,
        interval: "5m",
        timestamps: [1000, 2000],
        prices: [100, 110],
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60000
      };
    };
    marketSnapshotService.getQuote = async (symbol) => {
      quoteCalls += 1;
      return { symbol, name: symbol, price: 110, currency: "EUR" };
    };
    const position = db.prepare("SELECT id FROM positions WHERE symbol = 'AAA.PA'").get();
    const output = await runWithUser(1, async () => {
      const first = await portfolioService.positionsPerformance("1d");
      const afterFirst = { chartCalls, quoteCalls };
      const second = await portfolioService.positionsPerformance("1d");
      const afterSecond = { chartCalls, quoteCalls };
      await Promise.all([portfolioService.positionsPerformance("1d"), portfolioService.positionsPerformance("1d")]);
      const afterConcurrent = { chartCalls, quoteCalls };
      await portfolioService.updatePosition(position.id, { quantity: 2, averageBuyPrice: 10, currency: "EUR" });
      await portfolioService.positionsPerformance("1d");
      return { first, second, afterFirst, afterSecond, afterConcurrent, afterInvalidation: { chartCalls, quoteCalls } };
    });
    console.log("__RESULT__" + JSON.stringify(output));
  `);

  assert.equal(result.first.length, 1);
  assert.equal(result.second.length, 1);
  assert.equal(result.first[0].miniChart.range, "1d");
  assert.deepEqual(result.first[0].miniChart.points, [{ t: 1000, v: 100 }, { t: 2000, v: 110 }]);
  assert.deepEqual(result.second[0].miniChart.points, result.first[0].miniChart.points);
  assert.deepEqual(result.afterFirst, { chartCalls: 1, quoteCalls: 1 });
  assert.deepEqual(result.afterSecond, result.afterFirst);
  assert.deepEqual(result.afterConcurrent, result.afterFirst);
  assert.equal(result.afterInvalidation.chartCalls, 2);
  assert.equal(result.afterInvalidation.quoteCalls, 3);
});

test("portfolio position range percent uses interval market value as base", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { marketDataService } = await import("./services/market/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/market-snapshot.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    marketDataService.getChartData = async (symbol, range) => ({
      symbol,
      range,
      interval: "5m",
      timestamps: [1000, 2000],
      prices: [100, 110],
      cachedAt: Date.now(),
      expiresAt: Date.now() + 60000
    });
    marketSnapshotService.getQuote = async (symbol) => ({ symbol, name: symbol, price: 110, currency: "EUR" });
    const output = await runWithUser(1, async () => portfolioService.positionsPerformance("1d", { forceIntradayOpen: true }));
    console.log("__RESULT__" + JSON.stringify(output[0]));
  `);

  assert.equal(result.intervalPerformanceValue, 10);
  assert.equal(result.intervalPerformancePercent, 10);
  assert.equal(result.miniChart.points.length, 2);
  assert.equal(result.miniChart.points[1].v, 110);
});

test("portfolio position miniChart is capped to 40 points and follows selected range", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { marketDataService } = await import("./services/market/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/market-snapshot.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    let chartCalls = 0;
    marketDataService.getChartData = async (symbol, range) => {
      chartCalls += 1;
      return {
        symbol,
        range,
        interval: "1d",
        timestamps: Array.from({ length: 100 }, (_, index) => 1000 + index * 1000),
        prices: Array.from({ length: 100 }, (_, index) => 100 + index),
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60000
      };
    };
    marketSnapshotService.getQuote = async (symbol) => ({ symbol, name: symbol, price: 199, currency: "EUR" });
    const output = await runWithUser(1, async () => portfolioService.positionsPerformance("1m", { forceIntradayOpen: true }));
    console.log("__RESULT__" + JSON.stringify({ item: output[0], chartCalls }));
  `);

  assert.equal(result.chartCalls, 1);
  assert.equal(result.item.miniChart.range, "1m");
  assert.equal(result.item.miniChart.points.length, 40);
  assert.equal(result.item.miniChart.points[0].v, 100);
  assert.equal(result.item.miniChart.points.at(-1).v, 199);
});

test("portfolio 1d position performance includes previous close gap", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { marketDataService } = await import("./services/market/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/market-snapshot.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    marketDataService.getChartData = async (symbol, range) => ({
      symbol,
      range,
      interval: "5m",
      timestamps: [1000, 2000],
      prices: [95, 96.49],
      cachedAt: Date.now(),
      expiresAt: Date.now() + 60000
    });
    marketSnapshotService.getQuote = async (symbol) => ({ symbol, name: symbol, price: 96.49, previousClose: 100, currency: "EUR" });
    const output = await runWithUser(1, async () => portfolioService.positionsPerformance("1d", { forceIntradayOpen: true }));
    console.log("__RESULT__" + JSON.stringify(output[0]));
  `);

  assert.equal(result.intervalStartPrice, 100);
  assert.equal(Number(result.intervalPerformanceValue.toFixed(2)), -3.51);
  assert.equal(Number(result.intervalPerformancePercent.toFixed(2)), -3.51);
});

test("portfolio 1d position performance uses local market snapshot before chart tail", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { marketDataService } = await import("./services/market/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/market-snapshot.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    marketDataService.getChartData = async (symbol, range) => ({
      symbol,
      range,
      interval: "5m",
      timestamps: [1000, 2000],
      prices: [100, 101],
      cachedAt: Date.now(),
      expiresAt: Date.now() + 60000
    });
    marketSnapshotService.getQuote = async (symbol) => ({
      symbol,
      name: symbol,
      price: 103,
      previousClose: 100,
      change: 3,
      changePercent: 3,
      currency: "EUR"
    });
    const output = await runWithUser(1, async () => portfolioService.positionsPerformance("1d", { forceIntradayOpen: true }));
    console.log("__RESULT__" + JSON.stringify(output[0]));
  `);

  assert.equal(result.currentPrice, 103);
  assert.equal(result.intervalPerformanceValue, 3);
  assert.equal(result.intervalPerformancePercent, 3);
});

test("portfolio positions performance cache is isolated by user and emits SSE after stale background refresh", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { marketDataService } = await import("./services/market/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/market-snapshot.service.ts");
    const { marketEventsService } = await import("./services/market/market-events.service.ts");
    ${seedUser}
    db.prepare("INSERT INTO users (username, password_hash) VALUES ('bob', 'hash')").run();
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (2, 'AAA.PA', 'AAA', 3, 20, 'EUR')").run();
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
    db.prepare("INSERT INTO asset_market_snapshots (asset_id, market_state, last_price, previous_close, currency, source, updated_at, last_checked_at) VALUES (?, 'REGULAR', 110, 100, 'EUR', 'seed', '2026-05-06T07:00:00.000Z', '2026-05-06T07:00:00.000Z')").run(asset.id);
    let chartCalls = 0;
    marketDataService.getChartData = async (symbol, range) => {
      chartCalls += 1;
      return {
        symbol,
        range,
        interval: "5m",
        timestamps: [1000, 2000 + chartCalls],
        prices: [100, 110 + chartCalls],
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60000
      };
    };
    let quoteCalls = 0;
    marketSnapshotService.getQuote = async (symbol) => {
      quoteCalls += 1;
      const price = 110 + quoteCalls;
      return { symbol, name: symbol, price, previousClose: 100, change: price - 100, changePercent: price - 100, currency: "EUR" };
    };
    const events = [];
    marketEventsService.emitToUser = (userId, event, payload = {}) => {
      events.push({ userId: String(userId), event, payload });
    };
    const firstUser = await runWithUser(1, async () => portfolioService.positionsPerformance("1d"));
    const secondUser = await runWithUser(2, async () => portfolioService.positionsPerformance("1d"));
    db.prepare("UPDATE asset_market_snapshots SET updated_at = '2026-05-06T07:05:00.000Z', last_checked_at = '2026-05-06T07:05:00.000Z' WHERE asset_id = ?").run(asset.id);
    const staleServed = await runWithUser(1, async () => portfolioService.positionsPerformance("1d"));
    await new Promise((resolve) => setTimeout(resolve, 40));
    const refreshed = await runWithUser(1, async () => portfolioService.positionsPerformance("1d"));
    console.log("__RESULT__" + JSON.stringify({ firstUser, secondUser, staleServed, refreshed, events, chartCalls }));
  `);

  assert.equal(result.firstUser[0].quantity, 1);
  assert.equal(result.secondUser[0].quantity, 3);
  assert.equal(result.staleServed[0].currentPrice, result.firstUser[0].currentPrice);
  assert.notEqual(result.refreshed[0].currentPrice, result.firstUser[0].currentPrice);
  assert.ok(result.events.some((entry: any) => entry.userId === "1" && entry.event === "portfolio-performance-refresh-started"));
  assert.ok(result.events.some((entry: any) => entry.userId === "1" && entry.event === "portfolio-performance-updated"));
  assert.equal(result.chartCalls, 3);
});

test("open market window is resolved once per market date and range", () => {
  const result = runBackendScript(`
    const { getPreviousOpenMarketDays } = await import("./services/market/marketCalendar.service.ts");
    const { logger } = await import("./services/shared/logger.service.ts");
    const messages = [];
    logger.debug = (scope, message, meta) => {
      if (message === "open market window resolved") messages.push({ scope, message, meta });
    };
    const endDate = new Date("2026-05-06T12:00:00.000Z");
    for (const symbol of ["AI.PA", "BN.PA", "CW8.PA", "MC.PA", "OR.PA", "SAN.PA", "SU.PA", "TTE.PA", "VIE.PA", "VIV.PA", "KER.PA", "CAP.PA"]) {
      getPreviousOpenMarketDays({ symbol, exchange: "Paris" }, endDate, 1);
    }
    console.log("__RESULT__" + JSON.stringify({ count: messages.length, markets: messages.map((item) => item.meta.market) }));
  `);

  assert.equal(result.count, 1);
  assert.deepEqual(result.markets, ["euronextParis"]);
});

test("live refresh mode serves dashboard assets analysis and dividends from cache without Yahoo on navigation", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
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
