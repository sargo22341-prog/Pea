import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript as runIsolatedBackendScript } from "./helpers/backend-script.js";

function runBackendScript(script: string) {
  return runIsolatedBackendScript(script, { tempPrefix: "pea-portfolio-live-nav-" });
}
test("open market window is resolved once per market date and range", () => {
  const result = runBackendScript(`
    const { getPreviousOpenMarketDays } = await import("./services/market/calendars/marketCalendar.service.ts");
    const { logger } = await import("./services/shared/logger.service.ts");
    const messages = [];
    logger.debug = (scope, message, meta) => {
      if (message === "open market window resolved") messages.push({ scope, message, meta });
    };
    const endDate = new Date("2026-05-06T12:00:00.000Z");
    for (const symbol of ["AI.PA", "BN.PA", "CW8.PA", "MC.PA", "OR.PA", "SAN.PA", "SU.PA", "TTE.PA", "VIE.PA", "VIV.PA", "KER.PA", "CAP.PA"]) {
      getPreviousOpenMarketDays({ symbol, exchange: "Paris" }, endDate, 1);
    }
    console.log("__RESULT__" + JSON.stringify({ count: messages.length, markets: messages.map((item) => item.meta.market) }));
  `);

  assert.equal(result.count, 1);
  assert.deepEqual(result.markets, ["euronextParis"]);
});

test("live refresh mode serves dashboard assets analysis and dividends from cache while asset news refreshes in background", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { yahooService } = await import("./services/yahoo/index.ts");
    ${helpers}

    const calls = { quote: 0, quoteBatchRaw: 0, chart: 0, quoteSummary: 0, fundamentals: 0, marketInfo: 0, extraData: 0, news: 0 };
    yahooApi.quote = async (symbol) => { calls.quote += 1; return pricedQuoteRow(symbol, "REGULAR", 999); };
    yahooApi.quoteBatchRaw = async (symbols) => { calls.quoteBatchRaw += 1; return symbols.map((symbol) => pricedQuoteRow(symbol, "REGULAR", 999)); };
    yahooApi.chart = async () => { calls.chart += 1; return { quotes: [], dividends: [], splits: [] }; };
    yahooApi.quoteSummary = async () => { calls.quoteSummary += 1; return { profile: {}, raw: {} }; };
    yahooService.fundamentals = async () => { calls.fundamentals += 1; return { data: {}, stale: false }; };
    yahooService.marketInfo = async () => { calls.marketInfo += 1; return { data: {} }; };
    yahooService.extraData = async () => { calls.extraData += 1; return { data: {} }; };
    yahooService.news = async () => { calls.news += 1; return { data: [] }; };

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
        const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
        db.prepare(
          "INSERT INTO asset_quote_snapshot (asset_id, market_state, last_price, day_change, day_change_percent, previous_close, currency, exchange, source, last_checked_at, updated_at) VALUES (?, 'REGULAR', 123, 1, 0.82, 122, 'EUR', 'Paris', 'seed', ?, ?)"
        ).run(asset.id, new Date().toISOString(), new Date().toISOString());
        db.prepare(
          "INSERT INTO chart_candles (asset_id, range_key, interval, datetime_start, datetime_end, open, high, low, close, source) VALUES (?, '1d', '5m', '2026-05-06T07:00:00.000Z', '2026-05-06T07:05:00.000Z', 122, 123, 122, 122.5, 'seed'), (?, '1d', '5m', '2026-05-06T07:05:00.000Z', '2026-05-06T07:10:00.000Z', 122.5, 123, 122.5, 123, 'seed')"
        ).run(asset.id, asset.id);

        const now = Date.now();
        const expiresAt = now + 300000;
        const summary = {
          totalValue: 123,
          totalCost: 10,
          totalDividendsReceived: 0,
          totalFees: 0,
          totalPerformance: 113,
          totalPerformancePercent: 1130,
          positionsCount: 1,
          assetsCount: 1,
          currency: "EUR",
          positions: [{
            id: 1,
            symbol: "AAA.PA",
            name: "AAA",
            quantity: 1,
            averageBuyPrice: 10,
            currency: "EUR",
            currentPrice: 123,
            marketValue: 123,
            costBasis: 10,
            performance: 113,
            performancePercent: 1130,
            quote: { symbol: "AAA.PA", name: "AAA", price: 123, currency: "EUR", marketState: "REGULAR" }
          }]
        };
        const chart = {
          userId: "1",
          range: "intraday",
          timestamps: [new Date("2026-05-06T07:00:00.000Z").getTime(), new Date("2026-05-06T07:05:00.000Z").getTime()],
          value: [122.5, 123],
          invested: [10, 10],
          gain: [112.5, 113],
          gainPercent: [1125, 1130],
          cachedAt: now,
          expiresAt,
          transactionMarkers: []
        };
        const analysis = { countryAllocation: [], sectorAllocation: [], treemap: [], netMargins: [], financials: [], financialsByAsset: [], stale: false };
        const dividends = { annualEstimatedTotal: 0, currency: "EUR", months: [], upcoming: [], past: [], stale: false };
        const writeBlock = (block, range, payload) => db.prepare("INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at) VALUES (?, '1', ?, ?, ?, ?, ?)")
          .run(\`1:\${block}:\${range ?? "default"}\`, block, range ?? null, JSON.stringify(payload), now, expiresAt);
        writeBlock("portfolio-summary", "1d", summary);
        writeBlock("analysis", null, analysis);
        writeBlock("dividends", null, dividends);
        db.prepare("INSERT INTO portfolio_chart_cache (cache_key, user_id, range, payload, cached_at, expires_at) VALUES ('1:1d', '1', '1d', ?, ?, ?)")
          .run(JSON.stringify(chart), now, expiresAt);

        const responses = [];
        for (const path of ["/api/portfolio/full?range=1d", "/api/assets/AAA.PA?range=1d", "/api/portfolio/analysis", "/api/portfolio/dividends"]) {
          const response = await fetch(\`\${baseUrl}\${path}\`, { headers: { Cookie: cookie } });
          responses.push({ path, status: response.status });
          await response.json();
        }
        console.log("__RESULT__" + JSON.stringify({ calls, responses }));
      } finally {
        server.close();
      }
    });
  `);

  assert.ok(result.responses.every((response: any) => response.status === 200), JSON.stringify(result.responses));
  assert.deepEqual(result.calls, { quote: 0, quoteBatchRaw: 0, chart: 0, quoteSummary: 0, fundamentals: 0, marketInfo: 0, extraData: 0, news: 1 });
});
