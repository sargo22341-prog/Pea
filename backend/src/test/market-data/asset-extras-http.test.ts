import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface ExtrasResult {
  disabled: { insights: number; similar: number; quarterly: number };
  callsWhileDisabled: string[];
  invalidPeriod: number;
  annual: { status: number; rows: number; currency: string | null };
  annualCalls: string[];
  quarterly: { status: number; rows: number };
  insights: { status: number; shortTerm: string | null; hasUpsell: boolean };
  similar: { status: number; symbols: string[] };
  summaryModules: string[][];
}

test("asset extras honour feature flags, validate input and never fetch quarterly data for the annual view", () => {
  const result = runBackendScript(`
    const fs = await import("node:fs");
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooClient } = await import("./services/yahoo/yahoo.client.ts");
    const { featureFlagsService } = await import("./services/admin/feature-flags.service.ts");
    ${sessionUserHelpers}
    const fixture = (name) => JSON.parse(fs.readFileSync("test/fixtures/yahoo/" + name, "utf8"));
    const calls = [];
    yahooClient.fundamentalsTimeSeries = async (symbol, options) => {
      calls.push("timeseries:" + options.type + ":" + options.module);
      if (options.type === "quarterly" && options.module === "cash-flow") return fixture("us-stock.cash-flow.quarterly.json");
      return fixture("euronext-stock." + options.module + "." + options.type + ".json");
    };
    yahooClient.insights = async () => { calls.push("insights"); return fixture("us-stock.insights.json"); };
    yahooClient.recommendationsBySymbol = async () => { calls.push("similar"); return fixture("euronext-stock.similar.json"); };
    yahooClient.quote = async (symbols) => {
      calls.push("quote");
      return symbols.map((symbol) => ({ symbol, shortName: symbol + " SA", regularMarketPrice: 100, currency: "EUR", quoteType: "EQUITY", exchange: "PAR", fullExchangeName: "Paris", regularMarketChangePercent: 1.2 }));
    };
    const summaryModules = [];
    yahooClient.quoteSummary = async (_symbol, options) => { summaryModules.push(options.modules); return fixture("euronext-stock.summary.json"); };

    const alice = createUserWithSession("alice");
    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const get = (path) => fetch(baseUrl + path, { headers: { Cookie: alice.cookie } });
      try {
        const disabled = {
          insights: (await get("/api/assets/MC.PA/insights")).status,
          similar: (await get("/api/assets/MC.PA/similar")).status,
          quarterly: (await get("/api/assets/MC.PA/statements?period=quarterly")).status
        };
        const callsWhileDisabled = [...calls];
        const invalidPeriod = (await get("/api/assets/MC.PA/statements?period=monthly")).status;
        const annualResponse = await get("/api/assets/MC.PA/statements?period=annual");
        const annualBody = await annualResponse.json();
        const annualCalls = [...calls];

        featureFlagsService.update({ quarterly_statements: true, insights: true, similar_assets: true }, alice.id);
        const quarterlyResponse = await get("/api/assets/MC.PA/statements?period=quarterly");
        const insightsResponse = await get("/api/assets/AAPL/insights");
        const insightsText = await insightsResponse.text();
        const similarResponse = await get("/api/assets/MC.PA/similar");

        const { fetchExtraData } = await import("./services/yahoo/fundamentals/fundamentals.job.ts");
        featureFlagsService.update({ extended_fundamentals: false }, alice.id);
        await fetchExtraData("ZZ.PA");

        console.log("__RESULT__" + JSON.stringify({
          disabled,
          callsWhileDisabled,
          invalidPeriod,
          annual: { status: annualResponse.status, rows: annualBody.rows.length, currency: annualBody.currency ?? null },
          annualCalls,
          quarterly: { status: quarterlyResponse.status, rows: (await quarterlyResponse.json()).rows.length },
          insights: { status: insightsResponse.status, shortTerm: JSON.parse(insightsText).shortTerm?.direction ?? null, hasUpsell: insightsText.includes("upsell") },
          similar: { status: similarResponse.status, symbols: (await similarResponse.json()).map((item) => item.symbol) },
          summaryModules
        }));
      } finally {
        server.close();
      }
    });
  `) as ExtrasResult;

  assert.deepEqual(result.disabled, { insights: 403, similar: 403, quarterly: 403 });
  assert.deepEqual(result.callsWhileDisabled, [], "a disabled feature never calls Yahoo");
  assert.equal(result.invalidPeriod, 400);
  assert.equal(result.annual.status, 200);
  assert.ok(result.annual.rows > 0);
  assert.deepEqual([...result.annualCalls].sort(), ["timeseries:annual:balance-sheet", "timeseries:annual:cash-flow"], "no quarterly call for the annual view");
  assert.equal(result.quarterly.status, 200);
  assert.ok(result.quarterly.rows > 0);
  assert.deepEqual(result.insights, { status: 200, shortTerm: "bearish", hasUpsell: false });
  assert.deepEqual(result.similar, { status: 200, symbols: ["RMS.PA", "OR.PA", "KER.PA", "AI.PA", "SAN.PA"] });
  assert.equal(result.summaryModules.length, 1);
  assert.ok(!result.summaryModules[0]?.includes("recommendationTrend"), "extended modules are not requested when the feature is off");
});
