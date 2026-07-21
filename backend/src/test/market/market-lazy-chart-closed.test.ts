import { runBackendScript } from "../helpers/backend-script.js";
import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, seedUser } from "../helpers/backend-script.js";

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
