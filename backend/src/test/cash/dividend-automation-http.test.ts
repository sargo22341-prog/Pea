import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface Reply { status: number; body: Record<string, unknown> }

type HttpResult = Record<string, Reply> & { estimate: { status: number; body: { implied: number; buys: number; sells: number; publishedGross: number; warnings: string[] } } };

test("API : réglage d'ajout automatique, correction, ISIN et dividendes déjà perçus", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { dividendsRepository } = await import("./repositories/market/dividends.repository.ts");
    ${sessionUserHelpers}

    const alice = createUserWithSession("alice");
    const bob = createUserWithSession("bob");
    const carol = createUserWithSession("carol");
    // État initial au 1er mars : 1 000 versés, 450 restants ; 600 d'achats, 40 de ventes avant cette date.
    db.prepare("INSERT INTO cash_accounts (user_id, status, reference_at, opening_cash_cents, opening_deposits_cents) VALUES (?, 'ready', '2026-03-01T00:00:00.000Z', 45000, 100000)").run(alice.id);
    db.prepare("INSERT INTO cash_accounts (user_id, status) VALUES (?, 'ready'), (?, 'pending')").run(bob.id, carol.id);
    db.prepare("INSERT INTO assets (symbol, name, currency) VALUES ('TTE.PA', 'TotalEnergies', 'EUR')").run();
    const assetId = db.prepare("SELECT id FROM assets WHERE symbol = 'TTE.PA'").get().id;
    dividendsRepository.upsert(assetId, { date: "2026-01-20T07:00:00.000Z", amount: 1, currency: "EUR" });
    dividendsRepository.upsert(assetId, { date: "2026-05-14T07:00:00.000Z", amount: 1, currency: "EUR" });
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'TTE.PA', 'TotalEnergies', 10, 60, 'EUR')").run(alice.id);
    const positionId = db.prepare("SELECT id FROM positions WHERE user_id = ?").get(alice.id).id;
    const trade = (type, quantity, price, tradedAt) => db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, isin) VALUES (?, ?, ?, ?, 0, 'EUR', ?, 'FR0000120271')").run(positionId, type, quantity, price, tradedAt);
    trade("buy", 10, 60, "2026-01-05T10:00:00.000Z");
    trade("sell", 1, 40, "2026-02-01T10:00:00.000Z");
    trade("buy", 1, 0, "2026-02-02T10:00:00.000Z");

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const call = async (cookie, method, path, body) => {
        const response = await fetch(baseUrl + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : {} };
      };
      try {
        const settingsDefault = await call(alice.cookie, "GET", "/api/cash/dividend-settings");
        const settingsInvalid = await call(alice.cookie, "PUT", "/api/cash/dividend-settings", { autoAccept: "oui" });
        const settingsSaved = await call(alice.cookie, "PUT", "/api/cash/dividend-settings", { autoAccept: true });
        const bobSettings = await call(bob.cookie, "GET", "/api/cash/dividend-settings");
        const listed = await call(alice.cookie, "GET", "/api/cash/dividend-proposals");
        const id = listed.body.recent[0].id;
        const bobCorrect = await call(bob.cookie, "POST", \`/api/cash/dividend-proposals/\${id}/correct\`, { amount: 1 });
        const invalidCorrect = await call(alice.cookie, "POST", \`/api/cash/dividend-proposals/\${id}/correct\`, { amount: 0 });
        const corrected = await call(alice.cookie, "POST", \`/api/cash/dividend-proposals/\${id}/correct\`, { amount: 9.8 });
        const read = await call(alice.cookie, "POST", "/api/cash/dividend-proposals/notifications/read", {});
        const isinInvalid = await call(alice.cookie, "PUT", \`/api/portfolio/positions/\${positionId}/isin\`, { isin: "FR123" });
        const isinForeign = await call(bob.cookie, "PUT", \`/api/portfolio/positions/\${positionId}/isin\`, { isin: "FR0000120271" });
        const isinSaved = await call(alice.cookie, "PUT", \`/api/portfolio/positions/\${positionId}/isin\`, { isin: "fr0000120271" });
        const estimate = await call(alice.cookie, "GET", "/api/cash/account/opening-dividends");
        const estimatePending = await call(carol.cookie, "GET", "/api/cash/account/opening-dividends");
        const openingNegative = await call(alice.cookie, "PUT", "/api/cash/account/opening-dividends", { amount: -1 });
        const openingSaved = await call(alice.cookie, "PUT", "/api/cash/account/opening-dividends", { amount: 10 });
        const bobOpening = await call(bob.cookie, "PUT", "/api/cash/account/opening-dividends", { amount: 10 });
        const reconfigured = await call(alice.cookie, "PUT", "/api/cash/account", { referenceAt: "2026-03-01T00:00:00.000Z", cash: 460, deposits: 1000, withdrawals: 0 });
        console.log("__RESULT__" + JSON.stringify({
          settingsDefault, settingsInvalid, settingsSaved, bobSettings, bobCorrect, invalidCorrect,
          corrected: { status: corrected.status, body: { cashDividends: corrected.body.ledger.summary.cashDividends } },
          read: { status: read.status, body: { unread: read.body.unreadAutoAccepted } },
          isinInvalid, isinForeign, isinSaved, estimate, estimatePending, openingNegative,
          openingSaved: { status: openingSaved.status, body: { cashDividends: openingSaved.body.summary.cashDividends, cash: openingSaved.body.summary.cash, deposits: openingSaved.body.summary.deposits, declared: openingSaved.body.settings.openingDividends } },
          bobOpening,
          reconfigured: { status: reconfigured.status, body: { declared: reconfigured.body.settings.openingDividends ?? null } }
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as HttpResult;

  assert.deepEqual(result["settingsDefault"], { status: 200, body: { autoAccept: false } });
  assert.equal(result["settingsInvalid"]?.status, 400);
  assert.deepEqual(result["settingsSaved"], { status: 200, body: { autoAccept: true } });
  assert.deepEqual(result["bobSettings"]?.body, { autoAccept: false });
  assert.equal(result["bobCorrect"]?.status, 404);
  assert.equal(result["invalidCorrect"]?.status, 400);
  assert.deepEqual(result["corrected"], { status: 200, body: { cashDividends: 9.8 } });
  assert.deepEqual(result["read"], { status: 200, body: { unread: 0 } });
  assert.equal(result["isinInvalid"]?.status, 400);
  assert.equal(result["isinForeign"]?.status, 404);
  assert.deepEqual(result["isinSaved"], { status: 200, body: { positionId: result["isinSaved"]?.body["positionId"], isin: "FR0000120271" } });

  // 450 - 1 000 + 600 (achats) - 40 (vente) = 10 € ; publié : 1 € × 10 titres détenus le 20 janvier.
  assert.equal(result.estimate.status, 200);
  assert.deepEqual(
    { implied: result.estimate.body.implied, buys: result.estimate.body.buys, sells: result.estimate.body.sells, published: result.estimate.body.publishedGross, warnings: result.estimate.body.warnings },
    { implied: 10, buys: 600, sells: 40, published: 10, warnings: [] }
  );
  assert.equal(result["estimatePending"]?.status, 409);
  assert.equal(result["openingNegative"]?.status, 400);
  assert.deepEqual(result["openingSaved"], { status: 200, body: { cashDividends: 19.8, cash: 459.8, deposits: 1000, declared: 10 } }, "déclarés sans modifier le solde ni les versements");
  assert.equal(result["bobOpening"]?.status, 409, "sans état initial, rien à déclarer");
  assert.deepEqual(result["reconfigured"], { status: 200, body: { declared: null } }, "un état initial modifié demande de reconfirmer les dividendes");
});
