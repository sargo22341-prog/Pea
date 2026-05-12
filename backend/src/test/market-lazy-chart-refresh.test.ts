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
  assert.ok(result.firstDurationMs < 100, `route bloquante: ${result.firstDurationMs}ms`);
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
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
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
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
    const { getMarketCalendar } = await import("./services/market/calendars/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./repositories/market/market-run.repository.ts");
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
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
    const { getMarketCalendar } = await import("./services/market/calendars/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./repositories/market/market-run.repository.ts");
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
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
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

test("lazy chart refresh uses intraday interval for memory cache freshness", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
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
    const realDateNow = Date.now;
    const baseNow = realDateNow();
    Date.now = () => baseNow;
    await marketDataService.refreshLiveIntradayForAsset(asset, new Date("2026-05-06T12:06:00.000Z"));
    const fresh = chartRefreshService.requestAssetRefresh({ userId: 1, symbol: "AAA.PA", range: "1d", scope: "asset" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    Date.now = () => baseNow + 6 * 60_000;
    const stale = chartRefreshService.requestAssetRefresh({ userId: 1, symbol: "AAA.PA", range: "1d", scope: "asset" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    Date.now = realDateNow;
    console.log("__RESULT__" + JSON.stringify({ fresh, stale, chartCalls }));
  `);

  assert.equal(result.fresh.status, "skipped-fresh");
  assert.equal(result.stale.status, "started");
  assert.equal(result.chartCalls, 2);
});

test("lazy chart refresh stays available when live refresh mode is off", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "false";
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { chartRefreshService } = await import("./services/market/charts/chart-refresh.service.ts");
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
    const { chartRefreshService } = await import("./services/market/charts/chart-refresh.service.ts");
    const { getMarketCalendar } = await import("./services/market/calendars/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./repositories/market/market-run.repository.ts");
    const { localTradingDate } = await import("./schedulers/market-task.utils.ts");
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
    const { chartRefreshService } = await import("./services/market/charts/chart-refresh.service.ts");
    const { getMarketCalendar } = await import("./services/market/calendars/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./repositories/market/market-run.repository.ts");
    const { localTradingDate } = await import("./schedulers/market-task.utils.ts");
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
    const { chartRefreshService } = await import("./services/market/charts/chart-refresh.service.ts");
    const { getMarketCalendar } = await import("./services/market/calendars/getMarketCalendar.ts");
    const { marketRunRepository } = await import("./repositories/market/market-run.repository.ts");
    const { localTradingDate } = await import("./schedulers/market-task.utils.ts");
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
