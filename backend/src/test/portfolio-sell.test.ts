import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function runBackendScript(script: string, nodeEnv = "development") {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pea-test-"));
  const sqlitePath = path.join(tempDir, "test.sqlite");
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: nodeEnv,
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

test("wrong password at login returns 401", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

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
        const login = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password: "wrong_password" })
        });
        console.log("__RESULT__" + JSON.stringify({ status: login.status }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 401);
});

test("accessing protected route without session returns 401", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

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
        const portfolio = await fetch(\`\${baseUrl}/api/portfolio\`);
        const watchlist = await fetch(\`\${baseUrl}/api/watchlist\`);
        console.log("__RESULT__" + JSON.stringify({
          portfolioStatus: portfolio.status,
          watchlistStatus: watchlist.status
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.portfolioStatus, 401);
  assert.equal(result.watchlistStatus, 401);
});

test("sell transaction is accepted when quantity is available", () => {
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
        const position = await runWithUser(user.id, () => portfolioService.ensurePosition("AIR.PA", "Air Liquide", "EUR"));

        const buy = await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}/transactions\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ tradedAt: "2026-01-10T10:00:00.000Z", type: "buy", quantity: 5, price: 100, totalFees: 0, currency: "EUR" })
        });
        const sell = await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}/transactions\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ tradedAt: "2026-01-15T10:00:00.000Z", type: "sell", quantity: 3, price: 110, totalFees: 0, currency: "EUR" })
        });
        const transactions = await sell.json();
        console.log("__RESULT__" + JSON.stringify({
          buyStatus: buy.status,
          sellStatus: sell.status,
          transactionCount: transactions.length
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.buyStatus, 201);
  assert.equal(result.sellStatus, 201);
  assert.equal(result.transactionCount, 2);
});

test("sell transaction is rejected when quantity would go negative", () => {
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
        const position = await runWithUser(user.id, () => portfolioService.ensurePosition("AIR.PA", "Air Liquide", "EUR"));

        await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}/transactions\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ tradedAt: "2026-01-10T10:00:00.000Z", type: "buy", quantity: 2, price: 100, totalFees: 0, currency: "EUR" })
        });
        const oversell = await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}/transactions\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ tradedAt: "2026-01-15T10:00:00.000Z", type: "sell", quantity: 5, price: 110, totalFees: 0, currency: "EUR" })
        });
        const body = await oversell.json();
        console.log("__RESULT__" + JSON.stringify({ status: oversell.status, message: body.message ?? "" }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 400);
  assert.match(result.message, /negative|negatif|quantite/i);
});

test("transaction tradedAt invalide est refuse et une date valide est normalisee", () => {
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
        const position = await runWithUser(user.id, () => portfolioService.ensurePosition("AIR.PA", "Air Liquide", "EUR"));

        const invalid = await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}/transactions\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ tradedAt: "not-a-date", type: "buy", quantity: 1, price: 100, totalFees: 0, currency: "EUR" })
        });
        const valid = await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}/transactions\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ tradedAt: "2026-01-10 10:00", type: "buy", quantity: 1, price: 100, totalFees: 0, currency: "EUR" })
        });
        const body = await valid.json();
        console.log("__RESULT__" + JSON.stringify({
          invalidStatus: invalid.status,
          validStatus: valid.status,
          tradedAt: body[0]?.tradedAt
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.invalidStatus, 400);
  assert.equal(result.validStatus, 201);
  assert.match(result.tradedAt, /^2026-01-10T/);
});

test("creating a position via POST /portfolio/positions returns 201 with position data", () => {
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

        const create = await fetch(\`\${baseUrl}/api/portfolio/positions\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ symbol: "MC.PA", name: "LVMH", quantity: 1, averageBuyPrice: 600, currency: "EUR" })
        });
        const body = await create.json();
        console.log("__RESULT__" + JSON.stringify({
          status: create.status,
          symbol: body.symbol,
          currency: body.currency
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 201);
  assert.equal(result.symbol, "MC.PA");
  assert.equal(result.currency, "EUR");
});

test("deleting a position returns 204", () => {
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
        const position = await runWithUser(user.id, () => portfolioService.ensurePosition("RNO.PA", "Renault", "EUR"));

        const del = await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}\`, {
          method: "DELETE",
          headers: { Cookie: cookie }
        });
        const delAgain = await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}\`, {
          method: "DELETE",
          headers: { Cookie: cookie }
        });
        console.log("__RESULT__" + JSON.stringify({ deleteStatus: del.status, deleteAgainStatus: delAgain.status }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.deleteStatus, 204);
  assert.equal(result.deleteAgainStatus, 404);
});
