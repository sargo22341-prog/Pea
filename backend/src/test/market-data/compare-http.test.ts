import assert from "node:assert/strict";
import test from "node:test";
import type { CompareAssetDto } from "@pea/shared";
import { runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface CompareResult {
  columns: CompareAssetDto[];
  duplicates: CompareAssetDto[];
  invalidStatuses: number[];
  anonymousStatus: number;
}

test("compare returns the valuation, dividend and fund blocks of 2 to 4 assets and rejects invalid lists", () => {
  const result = runBackendScript(`
    const fs = await import("node:fs");
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooClient } = await import("./services/yahoo/yahoo.client.ts");
    ${sessionUserHelpers}
    const fixture = (name) => JSON.parse(fs.readFileSync("test/fixtures/yahoo/" + name, "utf8"));
    const summaries = { "MC.PA": "euronext-stock", "CW8.PA": "etf-with-returns" };
    yahooClient.quote = async (symbols) => symbols.filter((symbol) => summaries[symbol]).map((symbol) => ({
      symbol, shortName: symbol + " name", regularMarketPrice: 100, currency: "EUR", quoteType: symbol === "CW8.PA" ? "ETF" : "EQUITY", exchange: "PAR", fullExchangeName: "Paris"
    }));
    yahooClient.quoteSummary = async (symbol) => {
      if (!summaries[symbol]) throw new Error("Quote not found for symbol: " + symbol);
      return fixture(summaries[symbol] + ".summary.json");
    };
    yahooClient.fundamentalsTimeSeries = async () => [];

    const alice = createUserWithSession("alice");
    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      const get = (path, cookie = alice.cookie) => fetch(baseUrl + path, cookie ? { headers: { Cookie: cookie } } : {});
      try {
        const columns = await (await get("/api/compare?symbols=mc.pa,CW8.PA,UNKNOWN.PA")).json();
        const duplicates = await (await get("/api/compare?symbols=MC.PA,mc.pa,CW8.PA")).json();
        const invalid = [
          "/api/compare",
          "/api/compare?symbols=MC.PA",
          "/api/compare?symbols=MC.PA,MC.PA",
          "/api/compare?symbols=A.PA,B.PA,C.PA,D.PA,E.PA",
          "/api/compare?symbols=MC.PA,DROP%20TABLE"
        ];
        console.log("__RESULT__" + JSON.stringify({
          columns,
          duplicates,
          invalidStatuses: await Promise.all(invalid.map(async (path) => (await get(path)).status)),
          anonymousStatus: (await get("/api/compare?symbols=MC.PA,CW8.PA", null)).status
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as CompareResult;

  const [stock, etf, unknown] = result.columns;
  assert.deepEqual(result.columns.map((column) => column.symbol), ["MC.PA", "CW8.PA", "UNKNOWN.PA"], "requested order is kept");
  assert.equal(stock?.name, "MC.PA name");
  assert.equal(stock.isEtf, false);
  assert.ok(stock.valuation?.trailingPE, "stock valuation comes from the fundamentals cache");
  assert.equal(stock.dividend.payoutRatio, 0.5925);
  assert.ok(stock.financialHealth, "stocks expose their financial health");
  assert.equal(stock.fundDetails, undefined);

  assert.equal(etf?.isEtf, true);
  assert.equal(etf.financialHealth, undefined, "health ratios do not apply to an ETF");
  assert.equal(etf.analystConsensus, undefined);
  assert.ok(etf.fundDetails?.trailingReturns, "ETF returns are exposed for the fees family");

  assert.equal(unknown?.unavailable, true, "an unknown symbol is a n/a column, not an error");
  assert.deepEqual(result.duplicates.map((column) => column.symbol), ["MC.PA", "CW8.PA"], "duplicates are ignored");
  assert.deepEqual(result.invalidStatuses, [400, 400, 400, 400, 400]);
  assert.equal(result.anonymousStatus, 401);
});
