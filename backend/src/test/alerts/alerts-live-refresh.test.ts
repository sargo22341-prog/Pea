import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript, seedUser } from "../helpers/backend-script.js";

test("the live refresh evaluates the alerts of the refreshed symbols without extra Yahoo calls", () => {
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
    db.prepare("INSERT INTO user_alerts (user_id, symbol, type, params_json) VALUES (1, 'AAA.PA', 'price_above', ?)").run(JSON.stringify({ threshold: 50 }));
    db.prepare("INSERT INTO user_alerts (user_id, symbol, type, params_json) VALUES (1, 'AAA.PA', 'price_below', ?)").run(JSON.stringify({ threshold: 50 }));
    let batchCalls = 0;
    let otherCalls = 0;
    yahooApi.quoteBatchRaw = async (symbols) => { batchCalls += 1; return symbols.map((symbol) => pricedQuoteRow(symbol, "REGULAR", 100)); };
    yahooApi.quote = async () => { otherCalls += 1; throw new Error("no single quote expected"); };
    yahooApi.quoteSummary = async () => { otherCalls += 1; throw new Error("no fundamentals expected"); };
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });
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
    await new LiveMarketRefreshTask().run(groups.values(), new Date("2026-05-06T12:00:00.000Z"));
    const events = db.prepare("SELECT ua.type, e.payload_json FROM user_alert_events e JOIN user_alerts ua ON ua.id = e.alert_id").all();
    console.log("__RESULT__" + JSON.stringify({ batchCalls, otherCalls, events }));
  `) as { batchCalls: number; otherCalls: number; events: { type: string; payload_json: string }[] };

  assert.equal(result.batchCalls, 1);
  assert.equal(result.otherCalls, 0, "alerts reuse the stored data");
  assert.deepEqual(result.events.map((event) => event.type), ["price_above"]);
  assert.equal((JSON.parse(result.events[0]?.payload_json ?? "{}") as { price?: number }).price, 100);
});
