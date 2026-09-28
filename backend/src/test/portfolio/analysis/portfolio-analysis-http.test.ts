import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript } from "../../helpers/backend-script.js";
import { sessionUserHelpers } from "../../helpers/session-users.js";

interface AnalysisResult {
  status: number;
  anonymousStatus: number;
  treemapSymbols: string[];
  valuationSymbols: string[];
  trailingPE?: number;
  capitalization: string[];
  currencies: string[];
  etfCount: number;
  viaEtfSources: string[];
  dividendSymbols: string[];
  fcfCoverage?: number;
  correlationSymbols: string[];
  correlationObservations?: number;
  payloadVersion?: number;
  yahooCalls: string[];
}

test("portfolio analysis builds the quality tabs from cached data for the current user's positions only", () => {
  const result = runBackendScript(`
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { writeCache } = await import("./services/yahoo/cache/yahoo.cache.ts");
    ${helpers}
    ${sessionUserHelpers}

    const fixture = (name) => JSON.parse(fs.readFileSync(path.join("test", "fixtures", "yahoo", name), "utf8"));
    const row = (symbol) => pricedQuoteRow(symbol, "CLOSED", 50);
    yahooApi.quote = async (symbol) => row(symbol);
    yahooApi.quoteBatchRaw = async (symbols) => symbols.map(row);

    const owner = createUserWithSession("owner");
    const other = createUserWithSession("other");
    const positions = [[owner.id, "STOCK.PA", "Stock"], [owner.id, "WORLD.PA", "World ETF"], [other.id, "OTHER.PA", "Other"]];
    for (const [userId, symbol, name] of positions) {
      db.prepare("INSERT INTO assets (symbol, name, currency) VALUES (?, ?, 'EUR')").run(symbol, name);
      db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, ?, ?, 10, 40, 'EUR')").run(userId, symbol, name);
    }
    db.prepare("UPDATE assets SET quote_type = 'ETF' WHERE symbol = 'WORLD.PA'").run();

    writeCache("cached_fundamentals", "STOCK.PA", fixture("euronext-stock.summary.json"));
    writeCache("cached_fundamentals", "WORLD.PA", fixture("etf-with-holdings.summary.json"));
    writeCache("cached_fundamentals", "OTHER.PA", fixture("euronext-bank.summary.json"));
    for (const symbol of ["STOCK.PA", "WORLD.PA", "OTHER.PA"]) writeCache("cached_fundamentals", symbol + ":annual-financials", []);
    writeCache("cached_fundamentals", "STOCK.PA:annual-cash-flow", fixture("euronext-stock.cash-flow.annual.json"));

    // Quatre-vingt-dix séances : l'ETF suit l'action avec une variation propre.
    const insertCandle = db.prepare("INSERT INTO chart_candles (asset_id, range_key, interval, datetime_start, datetime_end, close) VALUES ((SELECT id FROM assets WHERE symbol = ?), 'all', '1d', ?, ?, ?)");
    const start = Date.now() - 120 * 86400000;
    let stock = 100, world = 100, otherClose = 100;
    for (let index = 0; index < 90; index += 1) {
      const move = Math.sin(index / 4) / 40;
      stock *= 1 + move;
      world *= 1 + move / 2 + Math.cos(index * 1.3) / 200;
      otherClose *= 1 - move;
      const day = new Date(start + index * 86400000).toISOString();
      insertCandle.run("STOCK.PA", day, day, stock);
      insertCandle.run("WORLD.PA", day, day, world);
      insertCandle.run("OTHER.PA", day, day, otherClose);
    }
    const usageBefore = db.prepare("SELECT MAX(id) AS id FROM yahoo_usage_logs").get().id ?? 0;

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      try {
        const response = await fetch(baseUrl + "/api/portfolio/analysis", { headers: { Cookie: owner.cookie } });
        const body = await response.json();
        const anonymous = await fetch(baseUrl + "/api/portfolio/analysis");
        const yahooCalls = db.prepare("SELECT method FROM yahoo_usage_logs WHERE id > ? AND cache_hit = 0 AND method NOT LIKE 'quote%'").all(usageBefore).map((entry) => entry.method);
        console.log("__RESULT__" + JSON.stringify({
          status: response.status,
          anonymousStatus: anonymous.status,
          treemapSymbols: body.treemap.map((item) => item.symbol).sort(),
          valuationSymbols: body.valuation.items.map((item) => item.symbol).sort(),
          trailingPE: body.valuation.trailingPE.value,
          capitalization: body.capitalizationAllocation.map((item) => item.name).sort(),
          currencies: body.currencyAllocation.map((item) => item.name),
          etfCount: body.lookThrough.etfCount,
          viaEtfSources: [...new Set(body.lookThrough.items.flatMap((item) => item.viaEtf.map((source) => source.symbol)))],
          dividendSymbols: body.dividendSustainability.map((item) => item.symbol),
          fcfCoverage: body.dividendSustainability[0]?.fcfCoverage,
          correlationSymbols: body.correlation?.assets.map((asset) => asset.symbol) ?? [],
          correlationObservations: body.correlation?.observations,
          payloadVersion: body.payloadVersion,
          yahooCalls
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as AnalysisResult;

  assert.equal(result.status, 200);
  assert.equal(result.anonymousStatus, 401);
  assert.deepEqual(result.treemapSymbols, ["STOCK.PA", "WORLD.PA"], "another user's position never appears");
  assert.deepEqual(result.valuationSymbols, ["STOCK.PA", "WORLD.PA"]);
  assert.ok(result.trailingPE !== undefined && result.trailingPE > 0);
  assert.ok(result.capitalization.includes("etf"));
  assert.deepEqual(result.currencies, ["EUR"]);
  assert.equal(result.etfCount, 1);
  assert.deepEqual(result.viaEtfSources, ["WORLD.PA"]);
  assert.deepEqual(result.dividendSymbols, ["STOCK.PA"], "ETFs and other users' lines are not rated");
  assert.ok(result.fcfCoverage !== undefined && result.fcfCoverage > 0, "the FCF coverage is read from the cached annual cash flow");
  assert.deepEqual(result.correlationSymbols, ["STOCK.PA", "WORLD.PA"]);
  assert.equal(result.correlationObservations, 89);
  assert.equal(result.payloadVersion, 3);
  assert.deepEqual(result.yahooCalls, [], "the analysis never calls Yahoo when the caches are fresh");
});
