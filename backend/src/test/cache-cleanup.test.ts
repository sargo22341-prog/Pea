import assert from "node:assert/strict";
import test from "node:test";
import type { AssetChartDto } from "@pea/shared";
import { intradayChartCache, readIntradayChartCache, writeIntradayChartCache } from "../services/market/charts/market-chart.helpers.js";
import { runBackendScript } from "./helpers/backend-script.js";

test("cache cleanup removes expired SQL cache rows and keeps valid rows", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { cacheCleanupService } = await import("./services/shared/cache-cleanup.service.ts");

    const now = 1_000_000;
    db.prepare("INSERT INTO cache_entries (scope, key, payload, fetched_at, expires_at) VALUES ('asset_article', 'expired', '{}', ?, ?), ('asset_article', 'valid', '{}', ?, ?)").run(now - 20, now - 1, now, now + 60_000);
    db.prepare("INSERT INTO portfolio_chart_cache (cache_key, user_id, range, payload, cached_at, expires_at) VALUES ('expired-chart', '1', '1d', '{}', ?, ?), ('valid-chart', '1', '1d', '{}', ?, ?)").run(now - 20, now - 1, now, now + 60_000);
    db.prepare("INSERT INTO portfolio_positions_performance_cache (cache_key, user_id, range, portfolio_version, market_data_version, payload, cached_at, expires_at) VALUES ('expired-perf', '1', '1d', 'p', 'm', '[]', ?, ?), ('valid-perf', '1', '1d', 'p', 'm', '[]', ?, ?)").run(now - 20, now - 1, now, now + 60_000);
    db.prepare("INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at) VALUES ('expired-block', '1', 'analysis', NULL, '{}', ?, ?), ('valid-block', '1', 'analysis', NULL, '{}', ?, ?)").run(now - 20, now - 1, now, now + 60_000);

    const cleanup = cacheCleanupService.purgeExpired(now, 1);
    const counts = {
      cacheEntries: db.prepare("SELECT COUNT(*) AS count FROM cache_entries").get().count,
      portfolioChart: db.prepare("SELECT COUNT(*) AS count FROM portfolio_chart_cache").get().count,
      portfolioPerformance: db.prepare("SELECT COUNT(*) AS count FROM portfolio_positions_performance_cache").get().count,
      frontendBlock: db.prepare("SELECT COUNT(*) AS count FROM frontend_block_cache").get().count,
      validCacheEntry: db.prepare("SELECT COUNT(*) AS count FROM cache_entries WHERE key = 'valid'").get().count,
      validChart: db.prepare("SELECT COUNT(*) AS count FROM portfolio_chart_cache WHERE cache_key = 'valid-chart'").get().count,
      validPerformance: db.prepare("SELECT COUNT(*) AS count FROM portfolio_positions_performance_cache WHERE cache_key = 'valid-perf'").get().count,
      validBlock: db.prepare("SELECT COUNT(*) AS count FROM frontend_block_cache WHERE cache_key = 'valid-block'").get().count
    };
    console.log("__RESULT__" + JSON.stringify({ cleanup, counts }));
  `);

  assert.equal(result.cleanup.totalDeleted, 4);
  assert.deepEqual(result.cleanup.deleted, {
    cache_entries: 1,
    portfolio_chart_cache: 1,
    portfolio_positions_performance_cache: 1,
    frontend_block_cache: 1
  });
  assert.equal(result.counts.cacheEntries, 1);
  assert.equal(result.counts.portfolioChart, 1);
  assert.equal(result.counts.portfolioPerformance, 1);
  assert.equal(result.counts.frontendBlock, 1);
  assert.equal(result.counts.validCacheEntry, 1);
  assert.equal(result.counts.validChart, 1);
  assert.equal(result.counts.validPerformance, 1);
  assert.equal(result.counts.validBlock, 1);
});

test("cache cleanup is idempotent", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { cacheCleanupService } = await import("./services/shared/cache-cleanup.service.ts");

    const now = 1_000_000;
    db.prepare("INSERT INTO cache_entries (scope, key, payload, fetched_at, expires_at) VALUES ('asset_article', 'expired', '{}', ?, ?)").run(now - 20, now - 1);
    const first = cacheCleanupService.purgeExpired(now, 10);
    const second = cacheCleanupService.purgeExpired(now, 10);
    const count = db.prepare("SELECT COUNT(*) AS count FROM cache_entries").get().count;
    console.log("__RESULT__" + JSON.stringify({ first, second, count }));
  `);

  assert.equal(result.first.totalDeleted, 1);
  assert.equal(result.second.totalDeleted, 0);
  assert.equal(result.count, 0);
});

test("intraday chart memory cache prunes expired entries and stays bounded", () => {
  intradayChartCache.clear();
  const now = Date.now();
  const chart: AssetChartDto = {
    symbol: "TEST",
    range: "intraday",
    interval: "5m",
    timestamps: [now],
    prices: [1],
    cachedAt: now,
    expiresAt: now + 60_000
  };

  writeIntradayChartCache("expired", chart, now - 1);
  assert.equal(readIntradayChartCache("expired"), undefined);
  assert.equal(intradayChartCache.has("expired"), false);

  for (let index = 0; index < 505; index++) {
    writeIntradayChartCache(`chart:${index}`, { ...chart, symbol: `TEST${index}` }, now + 60_000 + index);
  }

  assert.equal(intradayChartCache.size, 500);
  assert.equal(intradayChartCache.has("chart:0"), false);
  assert.ok(intradayChartCache.has("chart:504"));
  intradayChartCache.clear();
});
