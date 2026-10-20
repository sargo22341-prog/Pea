import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface Reply { status: number; body: { message?: string; details?: Record<string, unknown>; summary?: { cash: number; deposits: number } } }

interface GuardResult {
  noFunds: Reply;
  movementsAfterRefusal: number;
  insufficientFunding: Reply;
  movementsAfterInsufficientFunding: number;
  funded: Reply;
  afterFunding: { cash: number; deposits: number };
  overWithdrawal: Reply;
  fundedWithdrawal: Reply;
  depositDeletion: Reply;
  saleDeletion: Reply;
  bobDeletesAliceMovement: Reply;
  bobLedger: { cash: number; deposits: number };
  negativeAmount: Reply;
  futureDeposit: Reply;
  feeTooHigh: Reply;
}

test("le solde espèces protège achats, retraits et suppressions, sans versement implicite", () => {
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
    const bob = createUserWithSession("bob");
    const movements = () => db.prepare("SELECT COUNT(*) AS total FROM cash_movements WHERE user_id = ?").get(alice.id).total;
    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const call = async (cookie, method, path, body) => {
        const response = await fetch(baseUrl + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : {} };
      };
      try {
        const position = (await call(alice.cookie, "POST", "/api/portfolio/positions/ensure", { symbol: "AAA.PA", name: "AAA", currency: "EUR" })).body;
        await call(alice.cookie, "POST", "/api/cash/movements", { type: "deposit", amount: 300, effectiveAt: "2026-01-01T09:00:00.000Z" });
        const buy = { tradedAt: "2026-01-05T10:00:00.000Z", type: "buy", quantity: 5, price: 100, totalFees: 2, currency: "EUR" };
        const path = \`/api/portfolio/positions/\${position.id}/transactions\`;

        const noFunds = await call(alice.cookie, "POST", path, buy);
        const movementsAfterRefusal = movements();
        const insufficientFunding = await call(alice.cookie, "POST", path, { ...buy, funding: { amount: 100 } });
        const movementsAfterInsufficientFunding = movements();
        const funded = await call(alice.cookie, "POST", path, { ...buy, funding: { amount: 250 } });
        const afterFunding = (await call(alice.cookie, "GET", "/api/cash")).body.summary;

        const overWithdrawal = await call(alice.cookie, "POST", "/api/cash/movements", { type: "withdrawal", amount: 49, effectiveAt: "2026-01-06T09:00:00.000Z" });
        const fundedWithdrawal = await call(alice.cookie, "POST", "/api/cash/movements", { type: "withdrawal", amount: 10, effectiveAt: "2026-01-06T09:00:00.000Z", funding: { amount: 10 } });
        const firstDeposit = db.prepare("SELECT id FROM cash_movements WHERE user_id = ? ORDER BY id LIMIT 1").get(alice.id).id;
        const depositDeletion = await call(alice.cookie, "DELETE", \`/api/cash/movements/\${firstDeposit}\`);

        await call(alice.cookie, "POST", path, { tradedAt: "2026-02-01T10:00:00.000Z", type: "sell", quantity: 5, price: 110, totalFees: 0, currency: "EUR" });
        await call(alice.cookie, "POST", path, { tradedAt: "2026-02-02T10:00:00.000Z", type: "buy", quantity: 5, price: 110, totalFees: 0, currency: "EUR" });
        const sale = db.prepare("SELECT id FROM transactions WHERE type = 'sell'").get().id;
        const saleDeletion = await call(alice.cookie, "DELETE", \`\${path}/\${sale}\`);

        const bobDeletesAliceMovement = await call(bob.cookie, "DELETE", \`/api/cash/movements/\${firstDeposit}\`);
        const bobLedger = (await call(bob.cookie, "GET", "/api/cash")).body.summary;
        const negativeAmount = await call(alice.cookie, "POST", "/api/cash/movements", { type: "deposit", amount: -5, effectiveAt: "2026-01-01T09:00:00.000Z" });
        const futureDeposit = await call(alice.cookie, "POST", "/api/cash/movements", { type: "deposit", amount: 5, effectiveAt: "2999-01-01T09:00:00.000Z" });
        const feeTooHigh = await call(alice.cookie, "POST", "/api/cash/movements", { type: "fee", amount: 1000, effectiveAt: "2026-03-01T09:00:00.000Z" });

        console.log("__RESULT__" + JSON.stringify({
          noFunds, movementsAfterRefusal, insufficientFunding, movementsAfterInsufficientFunding, funded: { status: funded.status, body: {} }, afterFunding,
          overWithdrawal, fundedWithdrawal, depositDeletion, saleDeletion, bobDeletesAliceMovement, bobLedger, negativeAmount, futureDeposit, feeTooHigh
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as GuardResult;

  assert.equal(result.noFunds.status, 422);
  assert.deepEqual(result.noFunds.body.details, { code: "INSUFFICIENT_FUNDS", available: 300, required: 502, shortfall: 202, effectiveAt: "2026-01-05T10:00:00.000Z", fundable: true });
  assert.equal(result.movementsAfterRefusal, 1, "aucun versement créé sans confirmation");

  assert.equal(result.insufficientFunding.status, 422);
  assert.equal(result.insufficientFunding.body.details?.["shortfall"], 202, "le manque reste exprimé en versement total");
  assert.equal(result.movementsAfterInsufficientFunding, 1, "le versement d'une tentative échouée est annulé");

  assert.equal(result.funded.status, 201);
  assert.deepEqual(result.afterFunding, { ...result.afterFunding, cash: 48, deposits: 550 });

  assert.equal(result.overWithdrawal.status, 422);
  assert.equal(result.overWithdrawal.body.details?.["fundable"], false);
  assert.equal(result.fundedWithdrawal.status, 400, "un retrait ne se finance pas par un versement");
  assert.equal(result.depositDeletion.status, 422, "supprimer le versement rendrait le solde négatif");
  assert.equal(result.saleDeletion.status, 422, "supprimer la vente qui finance un rachat est refusé");

  assert.equal(result.bobDeletesAliceMovement.status, 404);
  assert.equal(result.bobLedger.cash, 0);
  assert.equal(result.bobLedger.deposits, 0);
  assert.equal(result.negativeAmount.status, 400);
  assert.equal(result.futureDeposit.status, 400);
  assert.equal(result.feeTooHigh.status, 422);
  assert.equal(result.feeTooHigh.body.details?.["fundable"], true, "des frais peuvent être financés par un versement confirmé");
});
