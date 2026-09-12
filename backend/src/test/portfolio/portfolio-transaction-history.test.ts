import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript, seedUser } from "../helpers/backend-script.js";

test("weighted average cost replay keeps fees and reduces cost proportionally on sales", () => {
  const result = runBackendScript(`
    import { replayTransactions } from "./services/portfolio/portfolio-calculations.ts";

    const rows = [
      { type: "buy", quantity: 10, price: 100, total_fees: 10, traded_at: "2026-01-10T10:00:00.000Z" },
      { type: "sell", quantity: 5, price: 150, total_fees: 3, traded_at: "2026-01-12T10:00:00.000Z" },
      { type: "buy", quantity: 5, price: 120, total_fees: null, traded_at: "2026-01-20T10:00:00.000Z" }
    ];
    console.log("__RESULT__" + JSON.stringify({
      full: replayTransactions(rows),
      beforeSecondBuy: replayTransactions(rows, Date.parse("2026-01-15T00:00:00.000Z"))
    }));
  `);

  assert.deepEqual(result.full, { quantity: 10, costBasis: 1105 });
  assert.deepEqual(result.beforeSecondBuy, { quantity: 5, costBasis: 505 });
});

test("transaction cache orders rows by real instant even when stored date strings sort differently", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { buildTransactionCache, getQuantityAtTime } from "./services/portfolio/portfolio-calculations.ts";

    ${seedUser}
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, 'AIR.PA', 'Air Liquide', 3, 100, 'EUR')").run();
    const positionId = db.prepare("SELECT id FROM positions").get().id;
    const insert = db.prepare("INSERT INTO transactions (position_id, type, quantity, price, currency, traded_at) VALUES (?, ?, ?, 100, 'EUR', ?)");
    // 08:30 UTC, mais textuellement posterieure a la vente de 09:00 UTC.
    insert.run(positionId, "buy", 5, "2026-01-10T10:30:00+02:00");
    insert.run(positionId, "sell", 2, "2026-01-10T09:00:00.000Z");

    const entry = buildTransactionCache([positionId]).get(positionId);
    console.log("__RESULT__" + JSON.stringify({
      order: entry.transactions.map((row) => row.type),
      quantityBetweenBuyAndSell: getQuantityAtTime(entry.transactions, Date.parse("2026-01-10T08:45:00.000Z"))
    }));
  `);

  assert.deepEqual(result.order, ["buy", "sell"]);
  assert.equal(result.quantityBetweenBuyAndSell, 5);
});

test("new buy transactions use ISO UTC dates and legacy CURRENT_TIMESTAMP dates are migrated", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { transactionTradedAtIsoMigration } from "./migrations/portfolio/033-transaction-traded-at-iso.ts";
    import { portfolioRepository } from "./repositories/portfolio/portfolio.repository.ts";

    ${seedUser}
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, 'AIR.PA', 'Air Liquide', 1, 100, 'EUR')").run();
    const positionId = db.prepare("SELECT id FROM positions").get().id;
    portfolioRepository.insertBuyTransactionNow(positionId, { quantity: 1, price: 100, currency: "EUR" });
    const insert = db.prepare("INSERT INTO transactions (position_id, type, quantity, price, currency, traded_at) VALUES (?, 'buy', 1, 100, 'EUR', ?)");
    insert.run(positionId, "2026-01-10 08:30:00");
    insert.run(positionId, "2026-01-11T09:00:00.000Z");
    transactionTradedAtIsoMigration.appliquer(db);

    console.log("__RESULT__" + JSON.stringify({
      tradedAt: db.prepare("SELECT traded_at FROM transactions WHERE position_id = ? ORDER BY id").all(positionId).map((row) => row.traded_at)
    }));
  `);

  const [createdNow, legacy, iso] = result.tradedAt;
  assert.match(createdNow, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(legacy, "2026-01-10T08:30:00.000Z");
  assert.equal(iso, "2026-01-11T09:00:00.000Z");
});
