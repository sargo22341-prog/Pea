import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "./helpers/backend-script.js";

test("runtime health endpoint requires an authenticated admin", () => {
  const result = runBackendScript(`
    import bcrypt from "bcryptjs";
    import { app } from "./app.ts";
    import { db } from "./db.ts";

    const password = "correct horse battery staple";
    const userPassword = "another correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "admin", password, confirmPassword: password })
        });
        db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')")
          .run("reader", await bcrypt.hash(userPassword, 4));

        const anonymous = await fetch(\`\${baseUrl}/api/admin/runtime-health\`);
        const login = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "reader", password: userPassword })
        });
        const userCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
        const nonAdmin = await fetch(\`\${baseUrl}/api/admin/runtime-health\`, { headers: { Cookie: userCookie } });
        console.log("__RESULT__" + JSON.stringify({ anonymousStatus: anonymous.status, nonAdminStatus: nonAdmin.status }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.anonymousStatus, 401);
  assert.equal(result.nonAdminStatus, 403);
});

test("runtime health endpoint returns metrics without triggering cleanup", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";
    import { db } from "./db.ts";

    const password = "correct horse battery staple";
    const now = Date.now();
    db.prepare("INSERT INTO cache_entries (scope, key, payload, fetched_at, expires_at) VALUES ('quote', 'expired', '{}', ?, ?), ('quote', 'valid', '{}', ?, ?), ('news', 'expired-news', '{}', ?, ?)")
      .run(now - 10_000, now - 1, now, now + 60_000, now - 10_000, now - 1);
    db.prepare("INSERT INTO portfolio_chart_cache (cache_key, user_id, range, payload, cached_at, expires_at) VALUES ('chart', '1', '1d', '{}', ?, ?)").run(now, now + 60_000);
    db.prepare("INSERT INTO portfolio_positions_performance_cache (cache_key, user_id, range, portfolio_version, market_data_version, payload, cached_at, expires_at) VALUES ('perf', '1', '1d', 'p', 'm', '[]', ?, ?)").run(now, now + 60_000);
    db.prepare("INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at) VALUES ('block', '1', 'analysis', NULL, '{}', ?, ?)").run(now, now + 60_000);

    const beforeExpired = db.prepare("SELECT COUNT(*) AS count FROM cache_entries WHERE expires_at <= ?").get(now).count;
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "admin", password, confirmPassword: password })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const response = await fetch(\`\${baseUrl}/api/admin/runtime-health\`, { headers: { Cookie: cookie } });
        const body = await response.json();
        const afterExpired = db.prepare("SELECT COUNT(*) AS count FROM cache_entries WHERE expires_at <= ?").get(now).count;
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body, beforeExpired, afterExpired }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 200);
  assert.equal(result.beforeExpired, 2);
  assert.equal(result.afterExpired, 2);
  assert.ok(result.body.cache);
  assert.ok(result.body.memory);
  assert.ok(result.body.queue);
  assert.ok(result.body.scheduler);
  assert.ok(result.body.yahoo);
  assert.equal(result.body.cache.cacheEntries.totalRows, 3);
  assert.equal(result.body.cache.cacheEntries.expiredRows, 2);
  assert.equal(result.body.cache.derivedCaches.portfolioChartCacheRows, 1);
  assert.equal(result.body.cache.derivedCaches.portfolioPositionsPerformanceCacheRows, 1);
  assert.equal(result.body.cache.derivedCaches.frontendBlockCacheRows, 1);
  const quoteScope = result.body.cache.cacheEntries.byScope.find((row: { scope: string }) => row.scope === "quote");
  assert.equal(quoteScope.rows, 2);
  assert.equal(quoteScope.expiredRows, 1);
  assert.equal(result.body.cache.cleanup.lastRunAt, undefined);
});

test("runtime health clears scheduler error after a successful tick marker", () => {
  const result = runBackendScript(`
    import { schedulerHealthRepository } from "./repositories/market/scheduler-health.repository.ts";
    import { runtimeHealthService } from "./services/admin/runtime-health.service.ts";

    schedulerHealthRepository.markError("market-scheduler", new Error("temporary yahoo failure"), new Date("2026-05-14T12:00:00.000Z"));
    const afterError = runtimeHealthService.snapshot(new Date("2026-05-14T12:01:00.000Z")).scheduler;
    schedulerHealthRepository.markSuccess("market-scheduler", new Date("2026-05-14T12:02:00.000Z"));
    const afterSuccess = runtimeHealthService.snapshot(new Date("2026-05-14T12:03:00.000Z")).scheduler;

    console.log("__RESULT__" + JSON.stringify({ afterError, afterSuccess }));
  `);

  assert.equal(result.afterError.status, "error");
  assert.equal(result.afterError.lastError, "temporary yahoo failure");
  assert.equal(result.afterSuccess.status, "healthy");
  assert.equal(result.afterSuccess.lastError, null);
});
