import { runBackendScript } from "../helpers/backend-script.js";
import assert from "node:assert/strict";
import test from "node:test";

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
