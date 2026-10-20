import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface Reply { status: number; body: Record<string, unknown> }

interface HttpResult {
  aliceList: { pending: { id: number; netAmount: number }[] };
  bobList: { pending: unknown[]; ignored: unknown[] };
  bobAccept: Reply;
  bobIgnore: Reply;
  bobRestore: Reply;
  invalidAmount: Reply;
  invalidDate: Reply;
  unknownField: Reply;
  invalidId: Reply;
  futureDate: Reply;
  corrected: Reply;
  movement: { amount_cents: number; effective_at: string; import_ref: string; user_id: number };
  bobMovements: number;
}

test("propositions de dividendes via l'API : appartenance, validation des entrées et correction", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { dividendsRepository } = await import("./repositories/market/dividends.repository.ts");
    ${sessionUserHelpers}

    const alice = createUserWithSession("alice");
    const bob = createUserWithSession("bob");
    db.prepare("INSERT INTO cash_accounts (user_id, status) VALUES (?, 'ready'), (?, 'ready')").run(alice.id, bob.id);
    db.prepare("INSERT INTO assets (symbol, name, currency) VALUES ('SAP.DE', 'SAP SE', 'EUR')").run();
    const assetId = db.prepare("SELECT id FROM assets WHERE symbol = 'SAP.DE'").get().id;
    dividendsRepository.upsert(assetId, { date: "2026-05-14T07:00:00.000Z", amount: 2, currency: "EUR" });
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'SAP.DE', 'SAP SE', 15, 100, 'EUR')").run(alice.id);
    const positionId = db.prepare("SELECT id FROM positions WHERE user_id = ?").get(alice.id).id;
    db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, isin) VALUES (?, 'buy', 15, 0, 0, 'EUR', '2026-01-10T10:00:00.000Z', 'DE0007164600')").run(positionId);

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const call = async (cookie, method, path, body) => {
        const response = await fetch(baseUrl + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : {} };
      };
      try {
        const aliceList = (await call(alice.cookie, "GET", "/api/cash/dividend-proposals")).body;
        const id = aliceList.pending[0].id;
        const bobList = (await call(bob.cookie, "GET", "/api/cash/dividend-proposals")).body;
        const bobAccept = await call(bob.cookie, "POST", \`/api/cash/dividend-proposals/\${id}/accept\`, {});
        const bobIgnore = await call(bob.cookie, "POST", \`/api/cash/dividend-proposals/\${id}/ignore\`, {});
        const bobRestore = await call(bob.cookie, "POST", \`/api/cash/dividend-proposals/\${id}/restore\`, {});
        const invalidAmount = await call(alice.cookie, "POST", \`/api/cash/dividend-proposals/\${id}/accept\`, { amount: -3 });
        const invalidDate = await call(alice.cookie, "POST", \`/api/cash/dividend-proposals/\${id}/accept\`, { effectiveAt: "pas une date" });
        const unknownField = await call(alice.cookie, "POST", \`/api/cash/dividend-proposals/\${id}/accept\`, { status: "accepted" });
        const invalidId = await call(alice.cookie, "POST", "/api/cash/dividend-proposals/abc/accept", {});
        const futureDate = await call(alice.cookie, "POST", \`/api/cash/dividend-proposals/\${id}/accept\`, { effectiveAt: "2999-01-01T00:00:00.000Z" });
        const corrected = await call(alice.cookie, "POST", \`/api/cash/dividend-proposals/\${id}/accept\`, { amount: 21.5, effectiveAt: "2026-05-20T09:00:00.000Z" });
        const movement = db.prepare("SELECT amount_cents, effective_at, import_ref, user_id FROM cash_movements WHERE type = 'dividend'").get();
        const bobMovements = db.prepare("SELECT COUNT(*) AS total FROM cash_movements WHERE user_id = ?").get(bob.id).total;
        console.log("__RESULT__" + JSON.stringify({
          aliceList, bobList, bobAccept, bobIgnore, bobRestore, invalidAmount, invalidDate, unknownField, invalidId, futureDate,
          corrected: { status: corrected.status, body: { cashDividends: corrected.body.ledger.summary.cashDividends, pending: corrected.body.proposals.pending.length } },
          movement, bobMovements
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as HttpResult;

  // 15 × 2 € = 30 € bruts ; retenue allemande 26,375 % (ISIN DE) = 7,91 € ; net 22,09 €.
  assert.equal(result.aliceList.pending[0]?.netAmount, 22.09);
  assert.deepEqual(result.bobList, { pending: [], ignored: [], cash: 0 });
  assert.equal(result.bobAccept.status, 404);
  assert.equal(result.bobIgnore.status, 404);
  assert.equal(result.bobRestore.status, 404);
  assert.equal(result.invalidAmount.status, 400);
  assert.equal(result.invalidDate.status, 400);
  assert.equal(result.unknownField.status, 400);
  assert.equal(result.invalidId.status, 400);
  assert.equal(result.futureDate.status, 400);
  assert.deepEqual(result.corrected, { status: 200, body: { cashDividends: 21.5, pending: 0 } });
  assert.equal(result.movement.amount_cents, 2150, "le montant corrigé est enregistré");
  assert.equal(result.movement.effective_at, "2026-05-20T09:00:00.000Z");
  assert.equal(result.movement.import_ref, "dividend:SAP.DE:2026-05-14");
  assert.equal(result.bobMovements, 0);
});
