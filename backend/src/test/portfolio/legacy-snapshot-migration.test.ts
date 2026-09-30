import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript, seedUser } from "../helpers/backend-script.js";

test("legacy position snapshots become origin transactions, so later mutations keep their quantity", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { materializeLegacyPositionSnapshotsMigration } = await import("./migrations/portfolio/045-materialize-legacy-position-snapshots.ts");
    ${seedUser}
    const addLegacy = (symbol, quantity, price) => {
      db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency, created_at) VALUES (1, ?, ?, ?, ?, 'EUR', '2024-01-10 09:30:00')").run(symbol, symbol, quantity, price);
      return db.prepare("SELECT id FROM positions WHERE symbol = ?").get(symbol).id;
    };
    const plain = addLegacy("AAA.PA", 10, 50);
    const splitted = addLegacy("BBB.PA", 20, 5);
    addLegacy("EMPTY.PA", 0, 0);
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES ('BBB.PA', 'BBB', 'Paris', 'EUR')").run();
    const assetId = db.prepare("SELECT id FROM assets WHERE symbol = 'BBB.PA'").get().id;
    db.prepare("INSERT INTO asset_splits (asset_id, split_date, numerator, denominator, source) VALUES (?, '2025-06-02', 4, 1, 'yahoo-chart')").run(assetId);
    const splitId = db.prepare("SELECT id FROM asset_splits").get().id;
    db.prepare("INSERT INTO user_split_decisions (user_id, asset_split_id, decision) VALUES (1, ?, 'apply')").run(splitId);

    materializeLegacyPositionSnapshotsMigration.appliquer(db);
    const originDates = db.prepare("SELECT p.symbol, t.traded_at FROM transactions t JOIN positions p ON p.id = t.position_id ORDER BY p.symbol").all();
    const output = await runWithUser(1, async () => {
      portfolioService.createTransaction(plain, { tradedAt: "2026-01-05T10:00:00.000Z", type: "sell", quantity: 2, price: 60, currency: "EUR" });
      const holdings = Object.fromEntries(portfolioService.listHoldings().map((position) => [position.symbol, { quantity: position.quantity, averageBuyPrice: position.averageBuyPrice }]));
      return { holdings, splittedTransactions: portfolioService.listTransactions(splitted).map((row) => ({ quantity: row.quantity, splitFactor: row.splitFactor ?? null })) };
    });
    console.log("__RESULT__" + JSON.stringify({ originDates, ...output }));
  `) as { originDates: { symbol: string; traded_at: string }[]; holdings: Record<string, { quantity: number; averageBuyPrice: number }>; splittedTransactions: { quantity: number; splitFactor: number | null }[] };

  assert.deepEqual(result.originDates, [
    { symbol: "AAA.PA", traded_at: "2024-01-10T09:30:00.000Z" },
    { symbol: "BBB.PA", traded_at: "2025-06-02T00:00:00.000Z" }
  ]);
  assert.deepEqual(result.holdings["AAA.PA"], { quantity: 8, averageBuyPrice: 50 }, "the sale starts from the legacy quantity");
  assert.deepEqual(result.holdings["BBB.PA"], { quantity: 20, averageBuyPrice: 5 }, "an applied split does not multiply the current snapshot");
  assert.deepEqual(result.splittedTransactions, [{ quantity: 20, splitFactor: null }]);
  assert.deepEqual(result.holdings["EMPTY.PA"], { quantity: 0, averageBuyPrice: 0 });
});
