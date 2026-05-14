import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript as runIsolatedBackendScript, seedUser } from "./helpers/backend-script.js";

function runBackendScript(script: string) {
  return runIsolatedBackendScript(script, { tempPrefix: "pea-market-auto-" });
}
test("market SSE endpoint is authenticated and always available", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");

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
        const unauthorized = await fetch(\`\${baseUrl}/api/market/events\`);
        const controller = new AbortController();
        const enabled = await fetch(\`\${baseUrl}/api/market/events\`, { headers: { Cookie: cookie }, signal: controller.signal });
        const enabledStatus = enabled.status;
        controller.abort();
        await enabled.body?.cancel().catch(() => undefined);
        const features = await fetch(\`\${baseUrl}/api/market/features\`, { headers: { Cookie: cookie } }).then((response) => response.json());
        console.log("__RESULT__" + JSON.stringify({ unauthorized: unauthorized.status, enabled: enabledStatus, features }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.unauthorized, 401);
  assert.equal(result.enabled, 200);
  assert.equal("sseEnabled" in result.features, false);
});

test("portfolio positions performance cache hits, dedupes and invalidates on position update", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    let chartCalls = 0;
    let quoteCalls = 0;
    marketDataService.getChartData = async (symbol, range) => {
      chartCalls += 1;
      return {
        symbol,
        range,
        interval: "5m",
        timestamps: [1000, 2000],
        prices: [100, 110],
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60000
      };
    };
    marketSnapshotService.getQuote = async (symbol) => {
      quoteCalls += 1;
      return { symbol, name: symbol, price: 110, currency: "EUR" };
    };
    const position = db.prepare("SELECT id FROM positions WHERE symbol = 'AAA.PA'").get();
    const output = await runWithUser(1, async () => {
      const first = await portfolioService.positionsPerformance("1d");
      const afterFirst = { chartCalls, quoteCalls };
      const second = await portfolioService.positionsPerformance("1d");
      const afterSecond = { chartCalls, quoteCalls };
      await Promise.all([portfolioService.positionsPerformance("1d"), portfolioService.positionsPerformance("1d")]);
      const afterConcurrent = { chartCalls, quoteCalls };
      await portfolioService.updatePosition(position.id, { quantity: 2, averageBuyPrice: 10, currency: "EUR" });
      await portfolioService.positionsPerformance("1d");
      return { first, second, afterFirst, afterSecond, afterConcurrent, afterInvalidation: { chartCalls, quoteCalls } };
    });
    console.log("__RESULT__" + JSON.stringify(output));
  `);

  assert.equal(result.first.length, 1);
  assert.equal(result.second.length, 1);
  assert.equal(result.first[0].miniChart.range, "1d");
  assert.deepEqual(result.first[0].miniChart.points, [{ t: 1000, v: 100 }, { t: 2000, v: 110 }]);
  assert.deepEqual(result.second[0].miniChart.points, result.first[0].miniChart.points);
  assert.deepEqual(result.afterFirst, { chartCalls: 1, quoteCalls: 1 });
  assert.deepEqual(result.afterSecond, result.afterFirst);
  assert.deepEqual(result.afterConcurrent, result.afterFirst);
  assert.equal(result.afterInvalidation.chartCalls, 2);
  assert.equal(result.afterInvalidation.quoteCalls, 3);
});

test("portfolio position range percent uses interval market value as base", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    marketDataService.getChartData = async (symbol, range) => ({
      symbol,
      range,
      interval: "5m",
      timestamps: [1000, 2000],
      prices: [100, 110],
      cachedAt: Date.now(),
      expiresAt: Date.now() + 60000
    });
    marketSnapshotService.getQuote = async (symbol) => ({ symbol, name: symbol, price: 110, currency: "EUR" });
    const output = await runWithUser(1, async () => portfolioService.positionsPerformance("1d", { forceIntradayOpen: true }));
    console.log("__RESULT__" + JSON.stringify(output[0]));
  `);

  assert.equal(result.intervalPerformanceValue, 10);
  assert.equal(result.intervalPerformancePercent, 10);
  assert.equal(result.miniChart.points.length, 2);
  assert.equal(result.miniChart.points[1].v, 110);
});

test("portfolio position miniChart is capped to 40 points and follows selected range", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    let chartCalls = 0;
    marketDataService.getChartData = async (symbol, range) => {
      chartCalls += 1;
      return {
        symbol,
        range,
        interval: "1d",
        timestamps: Array.from({ length: 100 }, (_, index) => 1000 + index * 1000),
        prices: Array.from({ length: 100 }, (_, index) => 100 + index),
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60000
      };
    };
    marketSnapshotService.getQuote = async (symbol) => ({ symbol, name: symbol, price: 199, currency: "EUR" });
    const output = await runWithUser(1, async () => portfolioService.positionsPerformance("1m", { forceIntradayOpen: true }));
    console.log("__RESULT__" + JSON.stringify({ item: output[0], chartCalls }));
  `);

  assert.equal(result.chartCalls, 1);
  assert.equal(result.item.miniChart.range, "1m");
  assert.equal(result.item.miniChart.points.length, 40);
  assert.equal(result.item.miniChart.points[0].v, 100);
  assert.equal(result.item.miniChart.points.at(-1).v, 199);
});

test("portfolio 1d position performance includes previous close gap", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    marketDataService.getChartData = async (symbol, range) => ({
      symbol,
      range,
      interval: "5m",
      timestamps: [1000, 2000],
      prices: [95, 96.49],
      cachedAt: Date.now(),
      expiresAt: Date.now() + 60000
    });
    marketSnapshotService.getQuote = async (symbol) => ({ symbol, name: symbol, price: 96.49, previousClose: 100, currency: "EUR" });
    const output = await runWithUser(1, async () => portfolioService.positionsPerformance("1d", { forceIntradayOpen: true }));
    console.log("__RESULT__" + JSON.stringify(output[0]));
  `);

  assert.equal(result.intervalStartPrice, 100);
  assert.equal(Number(result.intervalPerformanceValue.toFixed(2)), -3.51);
  assert.equal(Number(result.intervalPerformancePercent.toFixed(2)), -3.51);
});

test("portfolio 1d position performance uses local market snapshot before chart tail", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    marketDataService.getChartData = async (symbol, range) => ({
      symbol,
      range,
      interval: "5m",
      timestamps: [1000, 2000],
      prices: [100, 101],
      cachedAt: Date.now(),
      expiresAt: Date.now() + 60000
    });
    marketSnapshotService.getQuote = async (symbol) => ({
      symbol,
      name: symbol,
      price: 103,
      previousClose: 100,
      change: 3,
      changePercent: 3,
      currency: "EUR"
    });
    const output = await runWithUser(1, async () => portfolioService.positionsPerformance("1d", { forceIntradayOpen: true }));
    console.log("__RESULT__" + JSON.stringify(output[0]));
  `);

  assert.equal(result.currentPrice, 103);
  assert.equal(result.intervalPerformanceValue, 3);
  assert.equal(result.intervalPerformancePercent, 3);
});

test("portfolio positions performance cache is isolated by user and emits SSE after stale background refresh", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    const { marketEventsService } = await import("./services/market/events/market-events.service.ts");
    ${seedUser}
    db.prepare("INSERT INTO users (username, password_hash) VALUES ('bob', 'hash')").run();
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (2, 'AAA.PA', 'AAA', 3, 20, 'EUR')").run();
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
    db.prepare("INSERT INTO asset_quote_snapshot (asset_id, market_state, last_price, previous_close, currency, source, updated_at, last_checked_at) VALUES (?, 'REGULAR', 110, 100, 'EUR', 'seed', '2026-05-06T07:00:00.000Z', '2026-05-06T07:00:00.000Z')").run(asset.id);
    let chartCalls = 0;
    marketDataService.getChartData = async (symbol, range) => {
      chartCalls += 1;
      return {
        symbol,
        range,
        interval: "5m",
        timestamps: [1000, 2000 + chartCalls],
        prices: [100, 110 + chartCalls],
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60000
      };
    };
    let quoteCalls = 0;
    marketSnapshotService.getQuote = async (symbol) => {
      quoteCalls += 1;
      const price = 110 + quoteCalls;
      return { symbol, name: symbol, price, previousClose: 100, change: price - 100, changePercent: price - 100, currency: "EUR" };
    };
    const events = [];
    marketEventsService.emitToUser = (userId, event, payload = {}) => {
      events.push({ userId: String(userId), event, payload });
    };
    const firstUser = await runWithUser(1, async () => portfolioService.positionsPerformance("1d"));
    const secondUser = await runWithUser(2, async () => portfolioService.positionsPerformance("1d"));
    db.prepare("UPDATE asset_quote_snapshot SET updated_at = '2026-05-06T07:05:00.000Z', last_checked_at = '2026-05-06T07:05:00.000Z' WHERE asset_id = ?").run(asset.id);
    const staleServed = await runWithUser(1, async () => portfolioService.positionsPerformance("1d"));
    await new Promise((resolve) => setTimeout(resolve, 40));
    const refreshed = await runWithUser(1, async () => portfolioService.positionsPerformance("1d"));
    console.log("__RESULT__" + JSON.stringify({ firstUser, secondUser, staleServed, refreshed, events, chartCalls }));
  `);

  assert.equal(result.firstUser[0].quantity, 1);
  assert.equal(result.secondUser[0].quantity, 3);
  assert.equal(result.staleServed[0].currentPrice, result.firstUser[0].currentPrice);
  assert.notEqual(result.refreshed[0].currentPrice, result.firstUser[0].currentPrice);
  assert.ok(result.events.some((entry: any) => entry.userId === "1" && entry.event === "portfolio-performance-refresh-started"));
  assert.ok(result.events.some((entry: any) => entry.userId === "1" && entry.event === "portfolio-performance-updated"));
  assert.equal(result.chartCalls, 3);
});

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

test("live refresh mode serves dashboard assets analysis and dividends from cache without Yahoo on navigation", () => {
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
  assert.deepEqual(result.calls, { quote: 0, quoteBatchRaw: 0, chart: 0, quoteSummary: 0, fundamentals: 0, marketInfo: 0, extraData: 0, news: 0 });
});
