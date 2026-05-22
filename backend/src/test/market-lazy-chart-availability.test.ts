import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript as runIsolatedBackendScript, seedUser } from "./helpers/backend-script.js";

function runBackendScript(script: string) {
  return runIsolatedBackendScript(script, { tempPrefix: "pea-market-lazy-availability-" });
}
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
      "INSERT INTO chart_candles (asset_id, range_key, interval, datetime_start, datetime_end, open, high, low, close, source) VALUES (?, '1d', '5m', '2026-05-11T00:00:00.000Z', '2026-05-11T00:05:00.000Z', 100, 101, 99, 100, 'seed'), (?, '1d', '5m', '2026-05-11T00:05:00.000Z', '2026-05-11T00:10:00.000Z', 100, 102, 100, 101, 'seed')"
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

test("live stored intraday pending open serves latest known intraday candles from any stored interval", () => {
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
      "INSERT INTO chart_candles (asset_id, range_key, interval, datetime_start, datetime_end, open, high, low, close, source) VALUES (?, '1d', '15m', '2026-05-11T00:00:00.000Z', '2026-05-11T00:15:00.000Z', 100, 101, 99, 100, 'seed'), (?, '1d', '15m', '2026-05-11T00:15:00.000Z', '2026-05-11T00:30:00.000Z', 100, 102, 100, 101, 'seed')"
    ).run(asset.id, asset.id);
    const chart = await marketDataService.getChartData("7203.T", "1d", { intradayNow: new Date("2026-05-11T23:30:00.000Z") });
    console.log("__RESULT__" + JSON.stringify({
      points: chart.timestamps.length,
      interval: chart.interval,
      availabilityStatus: chart.availabilityStatus
    }));
  `);

  assert.equal(result.points, 2);
  assert.equal(result.interval, "15m");
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
      basisPointsLow: normalizeDividendYield(79),
      basisPoints: normalizeDividendYield(450),
      empty: normalizeDividendYield(null),
      aberrant: normalizeDividendYield(10050)
    }));
  `);

  assert.equal(result.fraction, 0.0475);
  assert.equal(result.percent, 0.0475);
  assert.equal(result.basisPointsLow, 0.0079);
  assert.equal(result.basisPoints, 0.045);
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
      "INSERT INTO chart_candles (asset_id, range_key, interval, datetime_start, datetime_end, open, high, low, close, source, updated_at) VALUES (?, '1d', '5m', '2026-05-06T07:00:00.000Z', '2026-05-06T07:05:00.000Z', 100, 101, 99, 100, 'seed', '2026-05-06T07:05:00.000Z')"
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
        "INSERT INTO chart_candles (asset_id, range_key, interval, datetime_start, datetime_end, open, high, low, close, source, updated_at) VALUES (?, '1d', '5m', '2026-05-06T07:00:00.000Z', '2026-05-06T07:05:00.000Z', 100, 101, 99, 100, 'seed', '2026-05-06T07:05:00.000Z')"
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
