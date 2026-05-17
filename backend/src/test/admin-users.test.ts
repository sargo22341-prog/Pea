import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "./helpers/backend-script.js";

test("bootstrap admin can list users", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";
    import { db } from "./db.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const response = await fetch(\`\${baseUrl}/api/admin/users\`, { headers: { Cookie: cookie } });
        const marker = db.prepare("SELECT bootstrap_admin FROM users WHERE username = 'alice'").get();
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.json(), bootstrapAdmin: marker.bootstrap_admin }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].username, "alice");
  assert.equal(result.body[0].role, "admin");
  assert.equal(result.body[0].password_hash, undefined);
  assert.equal(result.body[0].isProtectedAdmin, true);
  assert.equal(result.bootstrapAdmin, 1);
});

test("admin can create a standard user", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const response = await fetch(\`\${baseUrl}/api/admin/users\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ username: "bob", password })
        });
        const list = await fetch(\`\${baseUrl}/api/admin/users\`, { headers: { Cookie: cookie } });
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.json(), users: await list.json() }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 201);
  assert.equal(result.body.username, "bob");
  assert.equal(result.body.role, "user");
  assert.equal(result.users.length, 2);
});

test("admin user creation ignores requested admin role", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";
    import { db } from "./db.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const response = await fetch(\`\${baseUrl}/api/admin/users\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ username: "mallory", password, role: "admin" })
        });
        const row = db.prepare("SELECT role FROM users WHERE username = 'mallory'").get();
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.json(), storedRole: row.role }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 201);
  assert.equal(result.body.role, "user");
  assert.equal(result.storedRole, "user");
});

test("admin can delete a standard user", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const created = await fetch(\`\${baseUrl}/api/admin/users\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ username: "bob", password })
        });
        const user = await created.json();
        const deleted = await fetch(\`\${baseUrl}/api/admin/users/\${user.id}\`, { method: "DELETE", headers: { Cookie: cookie } });
        const list = await fetch(\`\${baseUrl}/api/admin/users\`, { headers: { Cookie: cookie } });
        console.log("__RESULT__" + JSON.stringify({ deleteStatus: deleted.status, users: await list.json() }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.deleteStatus, 204);
  assert.deepEqual(result.users.map((user: { username: string }) => user.username), ["alice"]);
});

test("deleting a standard user removes private data and only orphan global assets", () => {
  const result = runBackendScript(`
    import fs from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { app } from "./app.ts";
    import { db } from "./db.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      const profileIconPath = path.join(os.tmpdir(), \`pea-bob-icon-\${Date.now()}.png\`);
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const adminCookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";

        const bobResponse = await fetch(\`\${baseUrl}/api/admin/users\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ username: "bob", password })
        });
        const bob = await bobResponse.json();

        const charlieResponse = await fetch(\`\${baseUrl}/api/admin/users\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ username: "charlie", password })
        });
        const charlie = await charlieResponse.json();

        const bobLogin = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "bob", password })
        });
        const bobCookie = bobLogin.headers.get("set-cookie")?.split(";")[0] ?? "";

        fs.writeFileSync(profileIconPath, "avatar");
        db.prepare("UPDATE users SET profile_icon_path = ?, profile_icon_mime_type = 'image/png', profile_icon_size = 6, has_profile_icon = 1, local_pea_search_enabled = 0 WHERE id = ?").run(profileIconPath, bob.id);

        for (const symbol of ["BOBONLY.PA", "SHARED.PA", "WATCHBOB.PA", "CHARLIE.PA"]) {
          db.prepare("INSERT INTO assets (symbol, name, currency) VALUES (?, ?, 'EUR')").run(symbol, symbol);
          const asset = db.prepare("SELECT id FROM assets WHERE symbol = ?").get(symbol);
          db.prepare("INSERT INTO asset_profiles (asset_id, country, sector, source) VALUES (?, 'FR', 'Tech', 'test')").run(asset.id);
          db.prepare("INSERT INTO asset_quote_snapshot (asset_id, last_price, currency) VALUES (?, 10, 'EUR')").run(asset.id);
          db.prepare("INSERT INTO chart_candles (asset_id, range_key, interval, datetime_start, datetime_end, close) VALUES (?, '1d', '1m', '2026-01-01T09:00:00.000Z', '2026-01-01T09:01:00.000Z', 10)").run(asset.id);
        }

        db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'BOBONLY.PA', 'Bob only', 1, 10, 'EUR')").run(bob.id);
        db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'SHARED.PA', 'Shared', 1, 10, 'EUR')").run(bob.id);
        db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'SHARED.PA', 'Shared', 2, 20, 'EUR')").run(charlie.id);
        const bobPosition = db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = 'BOBONLY.PA'").get(bob.id);
        const charliePosition = db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = 'SHARED.PA'").get(charlie.id);
        db.prepare("INSERT INTO transactions (position_id, type, quantity, price, currency, traded_at) VALUES (?, 'buy', 1, 10, 'EUR', '2026-01-01T10:00:00.000Z')").run(bobPosition.id);
        db.prepare("INSERT INTO transactions (position_id, type, quantity, price, currency, traded_at) VALUES (?, 'buy', 2, 20, 'EUR', '2026-01-01T10:00:00.000Z')").run(charliePosition.id);
        db.prepare("INSERT INTO watchlist (user_id, symbol, name, currency) VALUES (?, 'WATCHBOB.PA', 'Bob watch', 'EUR')").run(bob.id);
        db.prepare("INSERT INTO watchlist (user_id, symbol, name, currency) VALUES (?, 'CHARLIE.PA', 'Charlie watch', 'EUR')").run(charlie.id);
        db.prepare("INSERT INTO user_assets (user_id, symbol, quantity, average_price, transaction_count, total_fees, invested_amount, updated_at) VALUES (?, 'BOBONLY.PA', 1, 10, 1, 0, 10, 1)").run(bob.id);
        db.prepare("INSERT INTO user_assets (user_id, symbol, quantity, average_price, transaction_count, total_fees, invested_amount, updated_at) VALUES (?, 'SHARED.PA', 2, 20, 1, 0, 40, 1)").run(charlie.id);
        db.prepare("INSERT INTO portfolio_chart_cache (cache_key, user_id, range, payload, cached_at, expires_at) VALUES ('bob-chart', ?, '1d', '{}', 1, 9999999999999)").run(String(bob.id));
        db.prepare("INSERT INTO portfolio_chart_cache (cache_key, user_id, range, payload, cached_at, expires_at) VALUES ('charlie-chart', ?, '1d', '{}', 1, 9999999999999)").run(String(charlie.id));
        db.prepare("INSERT INTO portfolio_positions_performance_cache (cache_key, user_id, range, portfolio_version, market_data_version, payload, cached_at, expires_at) VALUES ('bob-perf', ?, '1d', 'p', 'm', '[]', 1, 9999999999999)").run(String(bob.id));
        db.prepare("INSERT INTO portfolio_positions_performance_cache (cache_key, user_id, range, portfolio_version, market_data_version, payload, cached_at, expires_at) VALUES ('charlie-perf', ?, '1d', 'p', 'm', '[]', 1, 9999999999999)").run(String(charlie.id));
        db.prepare("INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at) VALUES ('bob-block', ?, 'analysis', NULL, '{}', 1, 9999999999999)").run(String(bob.id));
        db.prepare("INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at) VALUES ('charlie-block', ?, 'analysis', NULL, '{}', 1, 9999999999999)").run(String(charlie.id));

        const deleted = await fetch(\`\${baseUrl}/api/admin/users/\${bob.id}\`, { method: "DELETE", headers: { Cookie: adminCookie } });
        const bobAfterDelete = await fetch(\`\${baseUrl}/api/auth/me\`, { headers: { Cookie: bobCookie } });

        function count(sql, ...params) {
          return db.prepare(sql).get(...params).count;
        }

        console.log("__RESULT__" + JSON.stringify({
          deleteStatus: deleted.status,
          bobMeStatus: bobAfterDelete.status,
          profileIconExists: fs.existsSync(profileIconPath),
          bobUsers: count("SELECT COUNT(*) AS count FROM users WHERE id = ?", bob.id),
          bobSessions: count("SELECT COUNT(*) AS count FROM user_sessions WHERE user_id = ?", bob.id),
          bobPositions: count("SELECT COUNT(*) AS count FROM positions WHERE user_id = ?", bob.id),
          bobTransactions: count("SELECT COUNT(*) AS count FROM transactions t JOIN positions p ON p.id = t.position_id WHERE p.user_id = ?", bob.id),
          bobWatchlist: count("SELECT COUNT(*) AS count FROM watchlist WHERE user_id = ?", bob.id),
          bobUserAssets: count("SELECT COUNT(*) AS count FROM user_assets WHERE user_id = ?", bob.id),
          bobChartCache: count("SELECT COUNT(*) AS count FROM portfolio_chart_cache WHERE user_id = ?", String(bob.id)),
          bobPerfCache: count("SELECT COUNT(*) AS count FROM portfolio_positions_performance_cache WHERE user_id = ?", String(bob.id)),
          bobFrontendCache: count("SELECT COUNT(*) AS count FROM frontend_block_cache WHERE user_id = ?", String(bob.id)),
          charlieUsers: count("SELECT COUNT(*) AS count FROM users WHERE id = ?", charlie.id),
          charliePositions: count("SELECT COUNT(*) AS count FROM positions WHERE user_id = ?", charlie.id),
          charlieWatchlist: count("SELECT COUNT(*) AS count FROM watchlist WHERE user_id = ?", charlie.id),
          charlieUserAssets: count("SELECT COUNT(*) AS count FROM user_assets WHERE user_id = ?", charlie.id),
          charlieChartCache: count("SELECT COUNT(*) AS count FROM portfolio_chart_cache WHERE user_id = ?", String(charlie.id)),
          bobOnlyAsset: count("SELECT COUNT(*) AS count FROM assets WHERE symbol = 'BOBONLY.PA'"),
          bobWatchAsset: count("SELECT COUNT(*) AS count FROM assets WHERE symbol = 'WATCHBOB.PA'"),
          sharedAsset: count("SELECT COUNT(*) AS count FROM assets WHERE symbol = 'SHARED.PA'"),
          charlieAsset: count("SELECT COUNT(*) AS count FROM assets WHERE symbol = 'CHARLIE.PA'")
        }));
      } finally {
        server.close();
        if (fs.existsSync(profileIconPath)) fs.unlinkSync(profileIconPath);
      }
    });
  `);

  assert.equal(result.deleteStatus, 204);
  assert.equal(result.bobMeStatus, 200);
  assert.equal(result.profileIconExists, false);
  assert.equal(result.bobUsers, 0);
  assert.equal(result.bobSessions, 0);
  assert.equal(result.bobPositions, 0);
  assert.equal(result.bobTransactions, 0);
  assert.equal(result.bobWatchlist, 0);
  assert.equal(result.bobUserAssets, 0);
  assert.equal(result.bobChartCache, 0);
  assert.equal(result.bobPerfCache, 0);
  assert.equal(result.bobFrontendCache, 0);
  assert.equal(result.charlieUsers, 1);
  assert.equal(result.charliePositions, 1);
  assert.equal(result.charlieWatchlist, 1);
  assert.equal(result.charlieUserAssets, 1);
  assert.equal(result.charlieChartCache, 1);
  assert.equal(result.bobOnlyAsset, 0);
  assert.equal(result.bobWatchAsset, 0);
  assert.equal(result.sharedAsset, 1);
  assert.equal(result.charlieAsset, 1);
});

test("bootstrap admin cannot delete the current admin account", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const admin = await setup.json();
        const deleted = await fetch(\`\${baseUrl}/api/admin/users/\${admin.id}\`, { method: "DELETE", headers: { Cookie: cookie } });
        console.log("__RESULT__" + JSON.stringify({ status: deleted.status, body: await deleted.json() }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 409);
  assert.match(result.body.message, /propre compte/);
});

test("runtime user update cannot promote a standard user to admin", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const adminCookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        await fetch(\`\${baseUrl}/api/admin/users\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ username: "bob", password })
        });
        const login = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "bob", password })
        });
        const userCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
        const update = await fetch(\`\${baseUrl}/api/auth/me\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: userCookie },
          body: JSON.stringify({ role: "admin", bootstrapAdmin: true })
        });
        const me = await fetch(\`\${baseUrl}/api/auth/me\`, { headers: { Cookie: userCookie } });
        const adminRoute = await fetch(\`\${baseUrl}/api/admin/users\`, { headers: { Cookie: userCookie } });
        console.log("__RESULT__" + JSON.stringify({
          updateStatus: update.status,
          meBody: await me.json(),
          adminRouteStatus: adminRoute.status
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.updateStatus, 200);
  assert.equal(result.meBody.user.role, "user");
  assert.equal(result.adminRouteStatus, 403);
});

test("database guard rejects non-bootstrap admin creation and bootstrap marker changes", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";
    import { db } from "./db.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('bob', 'hash', 'user')").run();
        const messages = [];
        for (const run of [
          () => db.prepare("INSERT INTO users (username, password_hash, role, bootstrap_admin) VALUES ('eve', 'hash', 'admin', 0)").run(),
          () => db.prepare("UPDATE users SET role = 'admin' WHERE username = 'bob'").run(),
          () => db.prepare("UPDATE users SET bootstrap_admin = 0 WHERE username = 'alice'").run(),
          () => db.prepare("UPDATE users SET bootstrap_admin = 1 WHERE username = 'bob'").run()
        ]) {
          try {
            run();
            messages.push("accepted");
          } catch (error) {
            messages.push(error instanceof Error ? error.message : String(error));
          }
        }
        console.log("__RESULT__" + JSON.stringify({ messages }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.messages.length, 4);
  assert.ok(result.messages.every((message: string) => message !== "accepted"));
});

test("non-admin cannot access admin user routes", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const adminCookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        await fetch(\`\${baseUrl}/api/admin/users\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ username: "bob", password })
        });
        const login = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "bob", password })
        });
        const userCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
        const list = await fetch(\`\${baseUrl}/api/admin/users\`, { headers: { Cookie: userCookie } });
        const deleteAdmin = await fetch(\`\${baseUrl}/api/admin/users/1\`, { method: "DELETE", headers: { Cookie: userCookie } });
        const create = await fetch(\`\${baseUrl}/api/admin/users\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: userCookie },
          body: JSON.stringify({ username: "eve", password })
        });
        console.log("__RESULT__" + JSON.stringify({ listStatus: list.status, createStatus: create.status, deleteStatus: deleteAdmin.status }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.listStatus, 403);
  assert.equal(result.createStatus, 403);
  assert.equal(result.deleteStatus, 403);
});
