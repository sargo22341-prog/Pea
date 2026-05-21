import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript as runIsolatedBackendScript, seedUser } from "./helpers/backend-script.js";

function runBackendScript(script: string) {
  return runIsolatedBackendScript(script, { tempPrefix: "pea-market-auto-" });
}
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
  assert.ok(result.firstDurationMs < 1000, `route bloquante: ${result.firstDurationMs}ms`);
});

test("lazy chart refresh is skipped while cache is fresh", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { chartRefreshService } = await import("./services/market/charts/chart-refresh.service.ts");
    const { getMarketCalendar } = await import("./services/market/calendars/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./repositories/market/market-run.repository.ts");
    const { localTradingDate } = await import("./schedulers/market-task.utils.ts");
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
      "INSERT INTO chart_candles (asset_id, range_key, interval, datetime_start, datetime_end, open, high, low, close, source, updated_at) VALUES (?, '1d', '5m', ?, ?, 100, 101, 99, 100, 'seed', ?)"
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
    const { chartRefreshService } = await import("./services/market/charts/chart-refresh.service.ts");
    const { getMarketCalendar } = await import("./services/market/calendars/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./repositories/market/market-run.repository.ts");
    const { localTradingDate } = await import("./schedulers/market-task.utils.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const calendar = getMarketCalendar("AAA.PA", "Paris");
    const local = localTradingDate(new Date(), calendar.timezone);
    marketRunRepository.ensure({ marketKey: calendar.market, tradingDate: local.isoDate, timezone: calendar.timezone, assetsCount: 1 });
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
    db.prepare(
      "INSERT INTO chart_candles (asset_id, range_key, interval, datetime_start, datetime_end, open, high, low, close, source) VALUES (?, '1d', '5m', '2026-05-06T07:00:00.000Z', '2026-05-06T07:05:00.000Z', 100, 101, 99, 100, 'seed')"
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
    const { chartRefreshService } = await import("./services/market/charts/chart-refresh.service.ts");
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
    const candles = db.prepare("SELECT COUNT(*) AS count FROM chart_candles c JOIN assets a ON a.id = c.asset_id WHERE c.range_key = '1d' AND a.symbol = 'URTH'").get();
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
    const { chartRefreshService } = await import("./services/market/charts/chart-refresh.service.ts");
    const { getMarketCalendar } = await import("./services/market/calendars/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./repositories/market/market-run.repository.ts");
    const { localTradingDate } = await import("./schedulers/market-task.utils.ts");
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
      "INSERT INTO chart_candles (asset_id, range_key, interval, datetime_start, datetime_end, open, high, low, close, source) VALUES (?, '1d', '5m', ?, ?, 100, 101, 99, 100, 'seed')"
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

