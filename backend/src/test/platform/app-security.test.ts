import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

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

test("production CSP does not upgrade assets when public URL is HTTP", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/health\`);
        console.log("__RESULT__" + JSON.stringify({
          csp: response.headers.get("content-security-policy")
        }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { PUBLIC_URL: "http://192.168.0.44:4000", TRUST_PROXY: "false" } });

  assert.ok(!result.csp.includes("upgrade-insecure-requests"));
});

test("production CSP upgrades assets when public URL is HTTPS", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/health\`);
        console.log("__RESULT__" + JSON.stringify({
          csp: response.headers.get("content-security-policy")
        }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { PUBLIC_URL: "https://pea.example.com", TRUST_PROXY: "true" } });

  assert.ok(result.csp.includes("upgrade-insecure-requests"));
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
