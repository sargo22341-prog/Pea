import { runBackendScript } from "../helpers/backend-script.js";
import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, seedUser } from "../helpers/backend-script.js";

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
  assert.ok(result.events.some((entry: { event: string; userId: string }) => entry.userId === "1" && entry.event === "portfolio-performance-refresh-started"));
  assert.ok(result.events.some((entry: { event: string; userId: string }) => entry.userId === "1" && entry.event === "portfolio-performance-updated"));
  assert.equal(result.chartCalls, 3);
});

test("portfolio full reuses chart data once per symbol during a closed-market cache miss", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
    db.prepare("INSERT INTO asset_quote_snapshot (asset_id, market_state, last_price, previous_close, currency, source, updated_at, last_checked_at) VALUES (?, 'POSTPOST', 110, 100, 'EUR', 'seed', '2026-05-06T16:00:00.000Z', '2026-05-06T16:00:00.000Z')").run(asset.id);
    let chartCalls = 0;
    marketDataService.getChartData = async (symbol, range) => {
      chartCalls += 1;
      return {
        symbol,
        range,
        interval: "5m",
        timestamps: [1000, 2000],
        prices: [100, 110],
        baselinePrice: 100,
        baselineDatetime: new Date(1000).toISOString(),
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60000
      };
    };
    marketSnapshotService.getQuote = async (symbol) => ({ symbol, name: symbol, price: 110, previousClose: 100, change: 10, changePercent: 10, currency: "EUR", marketState: "POSTPOST" });
    const output = await runWithUser(1, async () => portfolioService.full("1d", 1));
    console.log("__RESULT__" + JSON.stringify({ chartCalls, points: output.chart.timestamps.length, baselinePrice: output.chart.baselinePrice }));
  `);

  assert.equal(result.chartCalls, 1);
  assert.equal(result.points, 2);
  assert.equal(result.baselinePrice, 100);
});

test("portfolio 1d summary and chart caches stay warm after every portfolio asset is closed", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
    db.prepare("INSERT INTO asset_quote_snapshot (asset_id, market_state, last_price, previous_close, currency, source, updated_at, last_checked_at) VALUES (?, 'POSTPOST', 110, 100, 'EUR', 'seed', '2026-05-06T16:00:00.000Z', '2026-05-06T16:00:00.000Z')").run(asset.id);
    marketDataService.getChartData = async (symbol, range) => ({
      symbol,
      range,
      interval: "5m",
      timestamps: [1000, 2000],
      prices: [100, 110],
      baselinePrice: 100,
      baselineDatetime: new Date(1000).toISOString(),
      cachedAt: Date.now(),
      expiresAt: Date.now() + 60000
    });
    marketSnapshotService.getQuote = async (symbol) => ({ symbol, name: symbol, price: 110, previousClose: 100, change: 10, changePercent: 10, currency: "EUR", marketState: "POSTPOST" });
    const before = Date.now();
    await runWithUser(1, async () => {
      await portfolioService.full("1d", 1);
      await portfolioService.positionsPerformance("1d");
    });
    const summary = db.prepare("SELECT expires_at, cached_at FROM frontend_block_cache WHERE cache_key = '1:portfolio-summary:1d'").get();
    const chart = db.prepare("SELECT expires_at, cached_at FROM portfolio_chart_cache WHERE cache_key = '1:1d:calendar-ranges-v2'").get();
    const positionsPerformance = db.prepare("SELECT expires_at, cached_at FROM portfolio_positions_performance_cache WHERE cache_key = '1:1d'").get();
    console.log("__RESULT__" + JSON.stringify({
      summaryTtl: Number(summary.expires_at) - before,
      chartTtl: Number(chart.expires_at) - before,
      positionsPerformanceTtl: Number(positionsPerformance.expires_at) - before,
      summaryCachedAt: summary.cached_at,
      chartCachedAt: chart.cached_at,
      positionsPerformanceCachedAt: positionsPerformance.cached_at
    }));
  `);

  assert.ok(result.summaryTtl > 48 * 60 * 60 * 1000);
  assert.ok(result.chartTtl > 48 * 60 * 60 * 1000);
  assert.ok(result.positionsPerformanceTtl > 48 * 60 * 60 * 1000);
});

