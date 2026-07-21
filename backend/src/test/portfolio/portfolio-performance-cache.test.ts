import { runBackendScript } from "../helpers/backend-script.js";
import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, seedUser } from "../helpers/backend-script.js";

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

