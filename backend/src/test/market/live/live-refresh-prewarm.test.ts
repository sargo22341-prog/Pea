import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript, seedUser } from "../../helpers/backend-script.js";

test("live refresh prewarm reads each chart once per cycle and yields to the event loop between blocks", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    const { LiveMarketRefreshTask } = await import("./jobs/market/live-market-refresh.task.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const chartCalls = [];
    marketDataService.getChartData = async (symbol, range) => {
      chartCalls.push(symbol + ":" + range);
      return { symbol, range: "intraday", interval: "5m", timestamps: [Date.now() - 600000, Date.now() - 300000], prices: [10, 11], baselinePrice: 10, cachedAt: 0, expiresAt: 0 };
    };
    marketSnapshotService.getQuote = async (symbol) => ({ symbol, name: symbol, price: 11, previousClose: 10, change: 1, changePercent: 10, currency: "EUR", marketState: "REGULAR" });
    let running = true;
    let ticks = 0;
    const tick = () => { if (!running) return; ticks += 1; setImmediate(tick); };
    setImmediate(tick);
    await new LiveMarketRefreshTask()["prewarmFrontendBlocks"](["AAA.PA"]);
    running = false;
    const cached = db.prepare("SELECT COUNT(*) AS count FROM portfolio_chart_cache").get().count;
    console.log("__RESULT__" + JSON.stringify({ intradayChartCalls: chartCalls.filter((call) => call === "AAA.PA:1d").length, ticks, cached }));
  `) as { intradayChartCalls: number; ticks: number; cached: number };

  assert.equal(result.intradayChartCalls, 1);
  assert.ok(result.ticks >= 5, `expected the event loop to run between the 5 portfolio blocks, got ${result.ticks} turns`);
  assert.equal(result.cached, 1);
});
