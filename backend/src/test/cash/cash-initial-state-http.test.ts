import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface InitialStateResult {
  pending: { status: string; historyIncomplete: boolean };
  depositWhilePending: number;
  buyWhilePending: number;
  configure: { status: number; summary: { status: string; cash: number; deposits: number; withdrawals: number; remainingCeiling: number } };
  opening: { amount: number; balanceAfter: number } | undefined;
  absorbedCount: number;
  depositBeforeReference: number;
  buyAfterReferenceWithoutFunds: number;
  correction: { cash: number; deposits: number };
  revisions: number;
  referenceBeforeDeposit: number;
  negativeOpening: number;
  popupAccounts: string[];
}

test("un portefeuille existant confirme son état initial sans versement reconstruit ni double comptage", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    ${helpers}
    ${sessionUserHelpers}
    yahooApi.quote = async (symbol) => pricedQuoteRow(symbol, "CLOSED", 100);
    yahooApi.quoteBatchRaw = async (symbols) => symbols.map((symbol) => pricedQuoteRow(symbol, "CLOSED", 100));
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });
    yahooApi.quoteSummary = async () => ({ profile: {}, raw: {} });

    const alice = createUserWithSession("alice");
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'AAA.PA', 'AAA', 10, 100, 'EUR')").run(alice.id);
    const positionId = db.prepare("SELECT id FROM positions WHERE user_id = ?").get(alice.id).id;
    db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source) VALUES (?, 'buy', 10, 100, 0, 'EUR', '2025-01-10T10:00:00.000Z', 'pdf_avis_opere')").run(positionId);

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const call = async (method, path, body) => {
        const response = await fetch(baseUrl + path, { method, headers: { "Content-Type": "application/json", Cookie: alice.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : {} };
      };
      try {
        const pending = (await call("GET", "/api/cash")).body.summary;
        const depositWhilePending = (await call("POST", "/api/cash/movements", { type: "deposit", amount: 10, effectiveAt: "2025-02-01T10:00:00.000Z" })).status;
        const buyWhilePending = (await call("POST", \`/api/portfolio/positions/\${positionId}/transactions\`, { tradedAt: "2025-03-01T10:00:00.000Z", type: "buy", quantity: 1, price: 100, currency: "EUR" })).status;

        const referenceAt = "2026-01-01T00:00:00.000Z";
        const configure = await call("PUT", "/api/cash/account", { referenceAt, cash: 150, deposits: 1500, withdrawals: 0 });
        const ledger = (await call("GET", "/api/cash")).body;
        const opening = ledger.entries.find((entry) => entry.kind === "opening");
        const depositBeforeReference = (await call("POST", "/api/cash/movements", { type: "deposit", amount: 10, effectiveAt: "2025-12-01T10:00:00.000Z" })).status;
        const buyAfterReferenceWithoutFunds = (await call("POST", \`/api/portfolio/positions/\${positionId}/transactions\`, { tradedAt: "2026-02-01T10:00:00.000Z", type: "buy", quantity: 2, price: 100, currency: "EUR" })).status;

        const correction = (await call("PUT", "/api/cash/account", { referenceAt, cash: 200, deposits: 1600, withdrawals: 0 })).body.summary;
        await call("POST", "/api/cash/movements", { type: "deposit", amount: 50, effectiveAt: "2026-03-01T10:00:00.000Z" });
        const referenceBeforeDeposit = (await call("PUT", "/api/cash/account", { referenceAt: "2026-04-01T00:00:00.000Z", cash: 0, deposits: 0, withdrawals: 0 })).status;
        await call("POST", \`/api/portfolio/positions/\${positionId}/transactions\`, { tradedAt: "2026-03-02T10:00:00.000Z", type: "buy", quantity: 2, price: 100, currency: "EUR" });
        const negativeOpening = (await call("PUT", "/api/cash/account", { referenceAt, cash: 0, deposits: 1600, withdrawals: 0 })).status;

        console.log("__RESULT__" + JSON.stringify({
          pending, depositWhilePending, buyWhilePending,
          configure: { status: configure.status, summary: configure.body.summary },
          opening, absorbedCount: ledger.entries.filter((entry) => entry.absorbed).length,
          depositBeforeReference, buyAfterReferenceWithoutFunds, correction,
          revisions: db.prepare("SELECT COUNT(*) AS total FROM cash_account_revisions WHERE user_id = ?").get(alice.id).total,
          referenceBeforeDeposit, negativeOpening,
          popupAccounts: db.prepare("SELECT status FROM cash_accounts").all().map((row) => row.status)
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as InitialStateResult;

  assert.equal(result.pending.status, "pending");
  assert.equal(result.pending.historyIncomplete, true);
  assert.equal(result.depositWhilePending, 409, "aucun versement tant que l'état initial n'est pas confirmé");
  assert.equal(result.buyWhilePending, 201, "les opérations restent possibles : l'état initial les résumera");

  assert.equal(result.configure.status, 200);
  assert.deepEqual(result.configure.summary, { ...result.configure.summary, status: "ready", cash: 150, deposits: 1500, withdrawals: 0, remainingCeiling: 148_500 });
  assert.deepEqual(result.opening, { ...result.opening, amount: 1250, balanceAfter: 150 }, "ajustement = 150 € confirmés + 1 100 € d'achats déjà résumés");
  assert.equal(result.absorbedCount, 2, "les achats antérieurs ne sont pas débités une seconde fois");
  assert.equal(result.depositBeforeReference, 400);
  assert.equal(result.buyAfterReferenceWithoutFunds, 422);
  assert.deepEqual(result.correction, { ...result.correction, cash: 200, deposits: 1600 });
  assert.equal(result.revisions, 2, "chaque confirmation ou correction est tracée");
  assert.equal(result.referenceBeforeDeposit, 409);
  assert.equal(result.negativeOpening, 422, "un état initial qui rendrait les achats suivants découverts est refusé");
  assert.deepEqual(result.popupAccounts, ["ready"]);
});
