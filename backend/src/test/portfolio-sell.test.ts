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
      PEA_TEST_SQLITE_PATH: sqlitePath
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

test("deleting the last manual transaction removes the empty position", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";
    import { runWithUser } from "./services/auth/user-context.ts";
    import { portfolioService } from "./services/portfolio/portfolio.service.ts";
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
        const user = await setup.json();
        const position = await runWithUser(user.id, () => portfolioService.ensurePosition("AIR.PA", "Air Liquide", "EUR"));

        const created = await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}/transactions\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ tradedAt: "2026-01-10T10:00:00.000Z", type: "buy", quantity: 1, price: 100, totalFees: 0, currency: "EUR" })
        });
        const transactions = await created.json();
        const deleted = await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}/transactions/\${transactions[0].id}\`, {
          method: "DELETE",
          headers: { Cookie: cookie }
        });
        const remainingPositions = db.prepare("SELECT COUNT(*) AS count FROM positions WHERE user_id = ? AND symbol = 'AIR.PA'").get(user.id).count;
        const remainingTransactions = db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE position_id = ?").get(position.id).count;
        console.log("__RESULT__" + JSON.stringify({ deleteStatus: deleted.status, remainingPositions, remainingTransactions }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.deleteStatus, 204);
  assert.equal(result.remainingPositions, 0);
  assert.equal(result.remainingTransactions, 0);
});

test("portfolio chart uses current value when manual buy is newer than market history", () => {
  const result = runBackendScript(`
    import { runWithUser } from "./services/auth/user-context.ts";
    import { portfolioService } from "./services/portfolio/portfolio.service.ts";
    import { marketDataService } from "./services/market/data/market-data.service.ts";
    import { marketSnapshotService } from "./services/market/snapshots/market-snapshot.service.ts";
    import { db } from "./db.ts";

    db.prepare("INSERT INTO users (username, password_hash) VALUES ('alice', 'hash')").run();
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES ('AIR.PA', 'Air Liquide', 'Paris', 'EUR')").run();

    marketDataService.getChartData = async () => ({
      symbol: "AIR.PA",
      range: "intraday",
      interval: "5m",
      timestamps: [new Date("2026-01-10T09:00:00.000Z").getTime(), new Date("2026-01-10T10:00:00.000Z").getTime()],
      prices: [1500, 1593.5],
      baselinePrice: 1593.5,
      baselineDatetime: "2026-01-10T08:59:00.000Z",
      cachedAt: 0,
      expiresAt: 0
    });
    marketSnapshotService.getQuote = async () => ({
      symbol: "AIR.PA",
      name: "Air Liquide",
      price: 1669,
      previousClose: 1593.5,
      change: 75.5,
      changePercent: 4.738,
      currency: "EUR",
      exchange: "Paris",
      marketState: "CLOSED"
    });

    const output = await runWithUser(1, async () => {
      const position = portfolioService.ensurePosition("AIR.PA", "Air Liquide", "EUR");
      portfolioService.createTransaction(position.id, {
        tradedAt: "2026-01-10T12:00:00.000Z",
        type: "buy",
        quantity: 1,
        price: 1593.5,
        totalFees: 0,
        currency: "EUR"
      });
      const summary = await portfolioService.summary("1d");
      const chart = await portfolioService.chart("1d", 1, { intradayNow: new Date("2026-01-10T12:05:00.000Z") });
      const positionsPerformance = await portfolioService.positionsPerformance("1d", { intradayNow: new Date("2026-01-10T12:05:00.000Z") });
      const miniValues = positionsPerformance[0]?.miniChart.points.map((point) => point.v) ?? [];
      return {
        firstChartValue: chart.value[0],
        lastTimestamp: chart.timestamps.at(-1),
        totalValue: summary.totalValue,
        lastChartValue: chart.value.at(-1),
        performanceEuro: chart.performanceEuro,
        performancePercent: chart.performancePercent,
        miniValues,
        miniLastTimestamp: positionsPerformance[0]?.miniChart.points.at(-1)?.t
      };
    });
    console.log("__RESULT__" + JSON.stringify(output));
  `);

  assert.equal(result.firstChartValue, 1500);
  assert.equal(result.totalValue, 1669);
  assert.equal(result.lastChartValue, 1669);
  assert.equal(result.lastTimestamp, new Date("2026-01-10T10:00:00.000Z").getTime());
  assert.equal(result.performanceEuro, 75.5);
  assert.ok(result.performancePercent > 4 && result.performancePercent < 5);
  assert.deepEqual(result.miniValues, [1500, 1593.5]);
  assert.equal(result.miniLastTimestamp, new Date("2026-01-10T10:00:00.000Z").getTime());
});

test("portfolio chart 1w ignores transactions older than the chart history window", () => {
  const result = runBackendScript(`
    import { runWithUser } from "./services/auth/user-context.ts";
    import { portfolioService } from "./services/portfolio/portfolio.service.ts";
    import { marketDataService } from "./services/market/data/market-data.service.ts";
    import { marketSnapshotService } from "./services/market/snapshots/market-snapshot.service.ts";
    import { db } from "./db.ts";

    db.prepare("INSERT INTO users (username, password_hash) VALUES ('alice', 'hash')").run();
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES ('AIR.PA', 'Air Liquide', 'Paris', 'EUR')").run();

    marketDataService.getChartData = async () => ({
      symbol: "AIR.PA",
      range: "1W",
      interval: "2h",
      timestamps: [
        new Date("2026-05-14T15:30:00.000Z").getTime(),
        new Date("2026-05-15T15:30:00.000Z").getTime(),
        new Date("2026-05-18T15:30:00.000Z").getTime(),
        new Date("2026-05-19T15:30:00.000Z").getTime(),
        new Date("2026-05-20T15:30:00.000Z").getTime()
      ],
      prices: [100, 101, 102, 103, 104],
      cachedAt: 0,
      expiresAt: 0
    });
    marketSnapshotService.getQuote = async () => ({
      symbol: "AIR.PA",
      name: "Air Liquide",
      price: 104,
      currency: "EUR",
      exchange: "Paris",
      marketState: "CLOSED"
    });

    const output = await runWithUser(1, async () => {
      const position = portfolioService.ensurePosition("AIR.PA", "Air Liquide", "EUR");
      portfolioService.createTransaction(position.id, {
        tradedAt: "2021-03-01T10:00:00.000Z",
        type: "buy",
        quantity: 2,
        price: 50,
        totalFees: 0,
        currency: "EUR"
      });
      const chart = await portfolioService.chart("1w", 1, { intradayNow: new Date("2026-05-21T12:00:00.000Z") });
      return {
        firstTimestamp: chart.timestamps[0],
        lastTimestamp: chart.timestamps.at(-1),
        count: chart.timestamps.length
      };
    });
    console.log("__RESULT__" + JSON.stringify(output));
  `);

  assert.equal(result.firstTimestamp, new Date("2026-05-14T15:30:00.000Z").getTime());
  assert.equal(result.lastTimestamp, new Date("2026-05-20T15:30:00.000Z").getTime());
  assert.equal(result.count, 5);
});
