import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "./helpers/backend-script.js";

test("default chart range keeps all as a valid user preference", () => {
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
        const update = await fetch(\`\${baseUrl}/api/auth/me\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ defaultChartRange: "all" })
        });
        const me = await fetch(\`\${baseUrl}/api/auth/me\`, { headers: { Cookie: cookie } });
        console.log("__RESULT__" + JSON.stringify({ updateStatus: update.status, meBody: await me.json() }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.updateStatus, 200);
  assert.equal(result.meBody.user.defaultChartRange, "all");
});

test("missing profile icon returns an empty 404 for image tags", () => {
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
        const icon = await fetch(\`\${baseUrl}/api/auth/me/profile-icon\`, { headers: { Cookie: cookie } });
        console.log("__RESULT__" + JSON.stringify({
          status: icon.status,
          contentType: icon.headers.get("content-type"),
          body: await icon.text()
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 404);
  assert.equal(result.contentType, null);
  assert.equal(result.body, "");
});

test("static JSON cache rejects non-whitelisted SQL targets", () => {
  const result = runBackendScript(`
    import { readStaticJsonCache } from "./services/shared/cache.service.ts";

    let message = "";
    try {
      readStaticJsonCache("users", "id", "1");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    console.log("__RESULT__" + JSON.stringify({ message }));
  `);

  assert.match(result.message, /non autorise/);
});

test("fresh SQLite schema contains transaction metadata and useful indexes", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";

    const transactionColumns = db.prepare("PRAGMA table_info(transactions)").all().map((row) => row.name);
    const positionColumns = db.prepare("PRAGMA table_info(positions)").all().map((row) => row.name);
    const watchlistColumns = db.prepare("PRAGMA table_info(watchlist)").all().map((row) => row.name);
    const snapshotColumns = db.prepare("PRAGMA table_info(asset_market_snapshots)").all().map((row) => row.name);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => row.name);

    console.log("__RESULT__" + JSON.stringify({ transactionColumns, positionColumns, watchlistColumns, snapshotColumns, indexes }));
  `);

  for (const column of ["total_fees", "source", "source_file_name", "asset_name", "isin", "ticker", "raw_text_snippet"]) {
    assert.ok(result.transactionColumns.includes(column), `missing transactions.${column}`);
  }
  assert.ok(result.positionColumns.includes("user_id"));
  assert.ok(result.watchlistColumns.includes("user_id"));
  assert.ok(result.indexes.includes("idx_transactions_position_traded_at"));
  assert.ok(result.indexes.includes("idx_positions_user_symbol"));
  assert.ok(result.indexes.includes("idx_chart_candles_asset_range_interval_start"));
  assert.ok(result.snapshotColumns.includes("market_core_updated_at"));
  assert.ok(result.snapshotColumns.includes("liquidity_updated_at"));
  assert.ok(result.snapshotColumns.includes("range_52w_updated_at"));
  assert.ok(result.snapshotColumns.includes("dividend_info_updated_at"));
  assert.ok(result.snapshotColumns.includes("market_profile_updated_at"));
  // Vérifie les index et colonnes créés par les migrations
  assert.ok(result.indexes.includes("idx_user_sessions_expires_at"), "index sessions manquant");
});

test("portfolio transactions with fees work on a fresh database", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";
    import { runWithUser } from "./services/auth/user-context.ts";
    import { portfolioService } from "./services/portfolio/portfolio.service.ts";

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
        const user = await setup.json();
        const emptySummary = await fetch(\`\${baseUrl}/api/portfolio\`, { headers: { Cookie: cookie } });
        const position = await runWithUser(user.id, () => portfolioService.ensurePosition("AIR.PA", "Air Liquide", "EUR"));
        const createTransaction = await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}/transactions\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ tradedAt: "2026-04-30T10:00:00.000Z", type: "buy", quantity: 2, price: 100, totalFees: 1.5, currency: "EUR" })
        });
        const transactions = await createTransaction.json();
        const listed = await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}/transactions\`, { headers: { Cookie: cookie } });
        console.log("__RESULT__" + JSON.stringify({
          createStatus: createTransaction.status,
          emptySummaryStatus: emptySummary.status,
          emptySummaryBody: await emptySummary.json(),
          transactionCount: transactions.length,
          firstFee: transactions[0]?.totalFees,
          listedStatus: listed.status,
          listedBody: await listed.json()
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.createStatus, 201);
  assert.equal(result.emptySummaryStatus, 200);
  assert.equal(result.emptySummaryBody.assetsCount, 0);
  assert.equal(result.transactionCount, 1);
  assert.equal(result.firstFee, 1.5);
  assert.equal(result.listedStatus, 200);
  assert.equal(result.listedBody[0].totalFees, 1.5);
});

test("technical second user cannot read another user's portfolio transactions", () => {
  const result = runBackendScript(`
    import bcrypt from "bcryptjs";
    import crypto from "node:crypto";
    import { app } from "./app.ts";
    import { db } from "./db.ts";
    import { runWithUser } from "./services/auth/user-context.ts";
    import { portfolioService } from "./services/portfolio/portfolio.service.ts";

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
        const user1 = await setup.json();
        const position = await runWithUser(user1.id, () => portfolioService.ensurePosition("AIR.PA", "Air Liquide", "EUR"));
        await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}/transactions\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie1 },
          body: JSON.stringify({ tradedAt: "2026-04-30T10:00:00.000Z", type: "buy", quantity: 2, price: 100, totalFees: 1.5, currency: "EUR" })
        });

        const bobHash = await bcrypt.hash(password, 12);
        db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')").run("bob", bobHash);
        const bob = db.prepare("SELECT id FROM users WHERE username = ?").get("bob");
        const token = "bob-session-token";
        const expiresAt = Math.floor(Date.now() / 1000) + 3600;
        db.prepare("INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(bob.id, hashToken(token), expiresAt);

        const bobTransactions = await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}/transactions\`, {
          headers: { Cookie: \`pea_session=\${token}\` }
        });
        const bobWatchlist = await fetch(\`\${baseUrl}/api/watchlist\`, {
          headers: { Cookie: \`pea_session=\${token}\` }
        });
        console.log("__RESULT__" + JSON.stringify({
          bobTransactionsStatus: bobTransactions.status,
          bobTransactionsBody: await bobTransactions.json(),
          bobWatchlistBody: await bobWatchlist.json()
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.bobTransactionsStatus, 200);
  assert.deepEqual(result.bobTransactionsBody, []);
  assert.deepEqual(result.bobWatchlistBody, []);
});

test("mutating API requests reject foreign origins", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "http://evil.example" },
          body: JSON.stringify({ username: "alice", password: "correct horse battery staple", confirmPassword: "correct horse battery staple" })
        });
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.json() }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 403);
});

test("production mutating requests accept configured public URL", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://pea.nas.meme" },
          body: JSON.stringify({ username: "alice", password: "correct horse battery staple", confirmPassword: "correct horse battery staple" })
        });
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.json() }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { PUBLIC_URL: "https://pea.nas.meme", TRUST_PROXY: "true" } });

  assert.equal(result.status, 201);
  assert.equal(result.body.username, "alice");
});

test("production mutating requests accept local host origin when public URL is empty", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const response = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: baseUrl },
          body: JSON.stringify({ username: "alice", password: "correct horse battery staple", confirmPassword: "correct horse battery staple" })
        });
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.json() }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { PUBLIC_URL: "", TRUST_PROXY: "false" } });

  assert.equal(result.status, 201);
  assert.equal(result.body.username, "alice");
});
