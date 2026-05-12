import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript as runIsolatedBackendScript, seedUser } from "./helpers/backend-script.js";

function runBackendScript(script: string) {
  return runIsolatedBackendScript(script, { tempPrefix: "pea-market-auto-" });
}
test("live refresh disabled preserves current behavior and does not call Yahoo", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "false";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    const { trackedMarketRepository } = await import("./repositories/market/tracked-market.repository.ts");
    const { marketRunRepository } = await import("./repositories/market/market-run.repository.ts");
    const { LiveMarketRefreshTask } = await import("./jobs/market/live-market-refresh.task.ts");
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
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    const { trackedMarketRepository } = await import("./repositories/market/tracked-market.repository.ts");
    const { marketRunRepository } = await import("./repositories/market/market-run.repository.ts");
    const { LiveMarketRefreshTask } = await import("./jobs/market/live-market-refresh.task.ts");
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
    const { trackedMarketRepository } = await import("./repositories/market/tracked-market.repository.ts");
    const { LiveMarketRefreshTask } = await import("./jobs/market/live-market-refresh.task.ts");
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
    const { trackedMarketRepository } = await import("./repositories/market/tracked-market.repository.ts");
    const { LiveMarketRefreshTask } = await import("./jobs/market/live-market-refresh.task.ts");
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
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
    const { trackedMarketRepository } = await import("./repositories/market/tracked-market.repository.ts");
    const { marketRunRepository } = await import("./repositories/market/market-run.repository.ts");
    const { LiveMarketRefreshTask } = await import("./jobs/market/live-market-refresh.task.ts");
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
    const { trackedMarketRepository } = await import("./repositories/market/tracked-market.repository.ts");
    const { marketRunRepository } = await import("./repositories/market/market-run.repository.ts");
    const { LiveMarketRefreshTask } = await import("./jobs/market/live-market-refresh.task.ts");
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
    const { trackedMarketRepository } = await import("./repositories/market/tracked-market.repository.ts");
    const { marketRunRepository } = await import("./repositories/market/market-run.repository.ts");
    const { LiveMarketRefreshTask } = await import("./jobs/market/live-market-refresh.task.ts");
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
