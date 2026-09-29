import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

interface MarketListCacheResult {
  failed: string[];
  recovered: string[];
  cached: string[];
  screenerCalls: number;
}

test("a failed Yahoo list is not cached for the rest of the day", () => {
  const result = runBackendScript(`
    const { yahooClient } = await import("./services/yahoo/yahoo.client.ts");
    const { fetchMarketList } = await import("./services/yahoo/screeners/top-movers.job.ts");
    let screenerCalls = 0;
    yahooClient.screener = async () => {
      screenerCalls += 1;
      if (screenerCalls === 1) throw new Error("Yahoo screener unavailable");
      return { quotes: [{ symbol: "TTE.PA", shortName: "TotalEnergies", regularMarketPrice: 60, regularMarketChange: 1, regularMarketChangePercent: 1.5, currency: "EUR", quoteType: "EQUITY" }] };
    };
    const symbols = async () => (await fetchMarketList("day_gainers")).items.map((item) => item.symbol);
    console.log("__RESULT__" + JSON.stringify({ failed: await symbols(), recovered: await symbols(), cached: await symbols(), screenerCalls }));
  `) as MarketListCacheResult;

  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.recovered, ["TTE.PA"], "the next display asks Yahoo again");
  assert.deepEqual(result.cached, ["TTE.PA"]);
  assert.equal(result.screenerCalls, 2, "a successful list stays cached");
});
