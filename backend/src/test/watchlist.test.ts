import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function runBackendScript(script: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pea-test-"));
  const sqlitePath = path.join(tempDir, "test.sqlite");
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "development",
      SQLITE_PATH: sqlitePath
    }
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  const jsonLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("__RESULT__"));

  assert.ok(jsonLine, result.stdout);
  return JSON.parse(jsonLine.slice("__RESULT__".length));
}

test("watchlist add, list and remove flow", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "false";
    const { app } = await import("./app.ts");

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

        const empty = await fetch(\`\${baseUrl}/api/watchlist\`, { headers: { Cookie: cookie } });

        const add = await fetch(\`\${baseUrl}/api/watchlist/AIR.PA\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ name: "Air Liquide", exchange: "PAR", currency: "EUR" })
        });

        const listed = await fetch(\`\${baseUrl}/api/watchlist\`, { headers: { Cookie: cookie } });
        const listedBody = await listed.json();

        const remove = await fetch(\`\${baseUrl}/api/watchlist/AIR.PA\`, {
          method: "DELETE",
          headers: { Cookie: cookie }
        });

        const afterRemove = await fetch(\`\${baseUrl}/api/watchlist\`, { headers: { Cookie: cookie } });
        const afterRemoveBody = await afterRemove.json();

        const removeAgain = await fetch(\`\${baseUrl}/api/watchlist/AIR.PA\`, {
          method: "DELETE",
          headers: { Cookie: cookie }
        });

        console.log("__RESULT__" + JSON.stringify({
          emptyStatus: empty.status,
          emptyBody: await empty.json(),
          addStatus: add.status,
          listedCount: listedBody.length,
          listedSymbol: listedBody[0]?.symbol,
          removeStatus: remove.status,
          afterRemoveCount: afterRemoveBody.length,
          removeAgainStatus: removeAgain.status
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.emptyStatus, 200);
  assert.deepEqual(result.emptyBody, []);
  assert.equal(result.addStatus, 201);
  assert.equal(result.listedCount, 1);
  assert.equal(result.listedSymbol, "AIR.PA");
  assert.equal(result.removeStatus, 204);
  assert.equal(result.afterRemoveCount, 0);
  assert.equal(result.removeAgainStatus, 404);
});

test("adding the same symbol twice is idempotent and returns exactly one watchlist entry", () => {
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

        const first = await fetch(\`\${baseUrl}/api/watchlist/AAPL\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ name: "Apple" })
        });
        const second = await fetch(\`\${baseUrl}/api/watchlist/AAPL\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ name: "Apple" })
        });
        const listed = await fetch(\`\${baseUrl}/api/watchlist\`, { headers: { Cookie: cookie } });
        const listedBody = await listed.json();
        console.log("__RESULT__" + JSON.stringify({
          firstStatus: first.status,
          secondStatus: second.status,
          count: listedBody.length
        }));
      } finally {
        server.close();
      }
    });
  `);

  // The service uses ON CONFLICT DO UPDATE (upsert), so both calls succeed with 201
  assert.equal(result.firstStatus, 201);
  assert.equal(result.secondStatus, 201);
  // Only one entry in the watchlist despite two adds
  assert.equal(result.count, 1);
});

test("watchlist is isolated between users: bob cannot see alice's watchlist items", () => {
  const result = runBackendScript(`
    import bcrypt from "bcryptjs";
    import crypto from "node:crypto";
    import { app } from "./app.ts";
    import { db } from "./db.ts";

    function hashToken(token) {
      return crypto.createHash("sha256").update(token).digest("hex");
    }

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
        const cookie1 = setup.headers.get("set-cookie")?.split(";")[0] ?? "";

        await fetch(\`\${baseUrl}/api/watchlist/MC.PA\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie1 },
          body: JSON.stringify({ name: "LVMH" })
        });

        const bobHash = await bcrypt.hash(password, 12);
        db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')").run("bob", bobHash);
        const bob = db.prepare("SELECT id FROM users WHERE username = ?").get("bob");
        const bobToken = "bob-wl-token";
        const expiresAt = Math.floor(Date.now() / 1000) + 3600;
        db.prepare("INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(bob.id, hashToken(bobToken), expiresAt);

        const bobWatchlist = await fetch(\`\${baseUrl}/api/watchlist\`, {
          headers: { Cookie: \`pea_session=\${bobToken}\` }
        });
        const bobBody = await bobWatchlist.json();

        console.log("__RESULT__" + JSON.stringify({ bobCount: bobBody.length }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.bobCount, 0);
});

test("watchlist add/remove invalide le cache frontend et la liste est relue immediatement", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { watchlistService } = await import("./services/assets/watchlist.service.ts");
    const { marketDataService } = await import("./services/market/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/market-snapshot.service.ts");
    const { marketEventsService } = await import("./services/market/market-events.service.ts");
    db.prepare("INSERT INTO users (username, password_hash) VALUES ('tester', 'hash')").run();
    const now = Date.now();
    const expiresAt = now + 60_000;
    const events = [];
    marketEventsService.emitToUser = (userId, event, payload = {}) => events.push({ userId: String(userId), event, payload });
    marketSnapshotService.getQuote = async (symbol) => ({ symbol, name: symbol, price: 10, currency: "EUR", exchange: "Paris" });
    marketDataService.getChartData = async (symbol, range) => ({ symbol, range, interval: "5m", timestamps: [1000], prices: [10], cachedAt: now, expiresAt });

    const output = await runWithUser(1, async () => {
      db.prepare("INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at) VALUES ('1:watchlist:1d', '1', 'watchlist', '1d', '[]', ?, ?)").run(now, expiresAt);
      await watchlistService.add("AIR.PA", { name: "Air Liquide", exchange: "Paris", currency: "EUR" });
      const afterAddCache = db.prepare("SELECT COUNT(*) AS count FROM frontend_block_cache WHERE block = 'watchlist'").get().count;
      const afterAddList = await watchlistService.list("1d");
      await watchlistService.remove("AIR.PA");
      const afterRemoveCache = db.prepare("SELECT COUNT(*) AS count FROM frontend_block_cache WHERE block = 'watchlist'").get().count;
      const afterRemoveList = await watchlistService.list("1d");
      return { afterAddCache, afterAddList, afterRemoveCache, afterRemoveList };
    });
    console.log("__RESULT__" + JSON.stringify({ ...output, events }));
  `);

  assert.equal(result.afterAddCache, 0);
  assert.equal(result.afterAddList.length, 1);
  assert.equal(result.afterAddList[0].symbol, "AIR.PA");
  assert.equal(result.afterRemoveCache, 0);
  assert.equal(result.afterRemoveList.length, 0);
  assert.equal(result.events.filter((entry: any) => entry.event === "watchlist-assets-updated").length, 2);
});
