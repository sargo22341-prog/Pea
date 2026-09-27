import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";

test("transaction replay cursor matches a full replay at every instant", () => {
  const result = runBackendScript(`
    const { replayTransactions } = await import("./services/portfolio/portfolio-calculations.ts");
    const { TransactionReplayCursor } = await import("./services/portfolio/portfolio-series.ts");
    const transactions = [
      { type: "buy", quantity: 10, price: 100, total_fees: 2, traded_at: "not a date" },
      { type: "buy", quantity: 5, price: 120, total_fees: 1, traded_at: "2026-01-05T09:00:00.000Z" },
      { type: "sell", quantity: 8, price: 130, total_fees: 1, traded_at: "2026-02-01T10:00:00.000Z" },
      { type: "buy", quantity: 3, price: 90, total_fees: 0, traded_at: "2026-02-01T10:00:00.000Z" }
    ];
    const cursor = new TransactionReplayCursor(transactions);
    const mismatches = [];
    for (let time = Date.parse("2025-12-31T00:00:00.000Z"); time <= Date.parse("2026-02-03T00:00:00.000Z"); time += 3600000) {
      const expected = replayTransactions(transactions, time);
      const actual = { ...cursor.advanceTo(time) };
      if (Math.abs(expected.quantity - actual.quantity) > 1e-9 || Math.abs(expected.costBasis - actual.costBasis) > 1e-9) mismatches.push(time);
    }
    let rejectsBackwards = false;
    try { cursor.advanceTo(0); } catch { rejectsBackwards = true; }
    console.log("__RESULT__" + JSON.stringify({ mismatches, final: cursor.holding, rejectsBackwards }));
  `) as { mismatches: number[]; final: { quantity: number; costBasis: number }; rejectsBackwards: boolean };

  assert.deepEqual(result.mismatches, []);
  assert.equal(result.final.quantity, 10);
  assert.equal(result.rejectsBackwards, true);
});

const portfolioScenario = `
  const { db } = await import("./db.ts");
  const { runWithUser } = await import("./services/auth/user-context.ts");
  const { portfolioPerformanceService } = await import("./services/portfolio/portfolio-performance.service.ts");
  const { marketDataService } = await import("./services/market/data/market-data.service.ts");
  const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
  db.prepare("INSERT INTO users (username, password_hash) VALUES ('tester', 'hash')").run();
  for (const symbol of ["AAA.PA", "BBB.PA"]) {
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES (?, ?, 'Paris', 'EUR')").run(symbol, symbol);
  }
  const insertPosition = db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, ?, ?, ?, ?, 'EUR')");
  insertPosition.run("AAA.PA", "AAA", 5, 100);
  insertPosition.run("BBB.PA", "BBB", 2, 50);
  const aaa = db.prepare("SELECT id FROM positions WHERE symbol = 'AAA.PA'").get().id;
  const insertTransaction = db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at) VALUES (?, ?, ?, ?, 0, 'EUR', ?)");
  insertTransaction.run(aaa, "buy", 10, 100, "2026-01-02T10:00:00.000Z");
  insertTransaction.run(aaa, "sell", 5, 120, "2026-01-04T10:00:00.000Z");
  const day = 86400000;
  const start = Date.parse("2026-01-01T17:00:00.000Z");
  marketDataService.getChartData = async (symbol) => {
    const timestamps = [];
    const prices = [];
    for (let index = 0; index < POINTS; index += 1) {
      timestamps.push(start + index * day);
      prices.push(symbol === "AAA.PA" ? 100 + index : 50);
    }
    return { symbol, range: "ALL", interval: "1d", timestamps, prices, cachedAt: 0, expiresAt: 0 };
  };
  marketSnapshotService.getQuote = async (symbol) => ({ symbol, name: symbol, price: symbol === "AAA.PA" ? 999 : 50, currency: "EUR" });
`;

test("portfolio curve values follow prices, dated transactions and undated holdings", () => {
  const points = runBackendScript(`
    const POINTS = 5;
    ${portfolioScenario}
    const output = await runWithUser(1, () => portfolioPerformanceService.performance("1m", { intradayNow: new Date("2026-01-10T00:00:00.000Z") }, 1));
    console.log("__RESULT__" + JSON.stringify(output));
  `) as { date: string; value: number; invested: number; stale: boolean }[];

  // Jours à 17h (prix AAA 100..104, BBB 50 x 2 sans transaction datée) + les deux transactions.
  assert.deepEqual(points.map((point) => [point.date, point.value, point.invested]), [
    ["2026-01-01T17:00:00.000Z", 100, 100],
    ["2026-01-02T10:00:00.000Z", 1100, 1100],
    ["2026-01-02T17:00:00.000Z", 1110, 1100],
    ["2026-01-03T17:00:00.000Z", 1120, 1100],
    ["2026-01-04T10:00:00.000Z", 610, 600],
    ["2026-01-04T17:00:00.000Z", 615, 600],
    ["2026-01-05T17:00:00.000Z", 620, 600]
  ]);
  assert.ok(points.every((point) => !point.stale));
});

test("long ranges are sampled to 520 points identical to the full curve points", () => {
  const result = runBackendScript(`
    const POINTS = 2000;
    ${portfolioScenario}
    const now = new Date("2040-01-01T00:00:00.000Z");
    const sampled = await runWithUser(1, () => portfolioPerformanceService.performance("all", { intradayNow: now }, 1));
    const full = await runWithUser(1, () => portfolioPerformanceService.performance("ytd", { intradayNow: now }, 1));
    const fullByDate = new Map(full.map((point) => [point.date, point]));
    const mismatches = sampled.filter((point) => {
      const reference = fullByDate.get(point.date);
      return !reference || reference.value !== point.value || reference.invested !== point.invested;
    });
    console.log("__RESULT__" + JSON.stringify({ sampled: sampled.length, full: full.length, mismatches: mismatches.length, first: sampled[0].date, last: sampled.at(-1).date, lastFull: full.at(-1).date }));
  `) as { sampled: number; full: number; mismatches: number; first: string; last: string; lastFull: string };

  assert.equal(result.full, 2002);
  assert.equal(result.sampled, 520);
  assert.equal(result.mismatches, 0);
  assert.equal(result.first, "2026-01-01T17:00:00.000Z");
  assert.equal(result.last, result.lastFull);
});
