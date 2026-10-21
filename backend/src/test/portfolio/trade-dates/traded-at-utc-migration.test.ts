import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript, seedUser } from "../../helpers/backend-script.js";

interface MigrationResult {
  before: { id: number; ms: number }[];
  after: { id: number; ms: number; tradedAt: string }[];
  holdingsBefore: unknown;
  holdingsAfter: unknown;
  orderBefore: number[];
  orderAfter: number[];
  replayed: string[];
}

test("la migration 55 convertit les dates sans fuseau en UTC sans changer l'instant lu ni les positions", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const { transactionTradedAtUtcMigration } = await import("./migrations/portfolio/055-transaction-traded-at-utc.ts");
    ${seedUser}
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, 'BN.PA', 'Danone', 0, 0, 'EUR')").run();
    const insert = db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source) VALUES (1, ?, ?, ?, 0.5, 'EUR', ?, 'pdf_avis_opere')");
    // Heure d'été, heure d'hiver, déjà UTC, et une vente sans fuseau le même jour qu'un achat UTC.
    insert.run("buy", 10, 60.58, "2021-07-08T09:00:05");
    insert.run("buy", 5, 58.1, "2026-01-15T10:00:00");
    insert.run("buy", 3, 61.2, "2026-09-15T08:33:37.000Z");
    insert.run("sell", 4, 63, "2026-09-15T10:40:00");
    const instants = () => db.prepare("SELECT id, traded_at FROM transactions ORDER BY id").all().map((row) => ({ id: row.id, ms: new Date(row.traded_at).getTime(), tradedAt: row.traded_at }));
    const snapshot = () => runWithUser(1, () => {
      portfolioService.recomputePositionFromAnyTransactions(1, 1);
      return {
        holdings: portfolioService.listHoldings().map((p) => ({ symbol: p.symbol, quantity: p.quantity, averageBuyPrice: p.averageBuyPrice })),
        order: portfolioService.listTransactions(1).map((t) => Number(t.id))
      };
    });
    const before = instants();
    const first = snapshot();
    transactionTradedAtUtcMigration.appliquer(db);
    const once = instants();
    transactionTradedAtUtcMigration.appliquer(db);
    const after = instants();
    const second = snapshot();
    console.log("__RESULT__" + JSON.stringify({
      before: before.map(({ id, ms }) => ({ id, ms })), after,
      holdingsBefore: first.holdings, holdingsAfter: second.holdings, orderBefore: first.order, orderAfter: second.order,
      replayed: once.map((row) => row.tradedAt).filter((value, index) => value !== after[index].tradedAt)
    }));
  `, { env: { TZ: "Europe/Paris" } }) as MigrationResult;

  assert.deepEqual(result.after.map((row) => row.tradedAt), [
    "2021-07-08T07:00:05.000Z",
    "2026-01-15T09:00:00.000Z",
    "2026-09-15T08:33:37.000Z",
    "2026-09-15T08:40:00.000Z"
  ]);
  assert.deepEqual(result.after.map(({ id, ms }) => ({ id, ms })), result.before, "chaque instant lu par l'application est inchangé");
  assert.deepEqual(result.holdingsAfter, result.holdingsBefore, "quantité et PRU inchangés");
  assert.deepEqual(result.orderAfter, result.orderBefore, "ordre chronologique inchangé");
  assert.deepEqual(result.replayed, [], "rejouer la migration ne modifie rien");
});
