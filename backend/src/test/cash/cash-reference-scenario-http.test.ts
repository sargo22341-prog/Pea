import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface ScenarioResult {
  cash: { cash: number; deposits: number; withdrawals: number; netDeposits: number; cashDividends: number; realizedGain: number; remainingCeiling: number; status: string };
  depositCount: number;
  positionB: { quantity: number; costBasis: number; marketValue: number };
  positionACount: number;
  pea: { cash: number; positionsValue: number; totalValue: number; globalGain: number; deposits: number };
  saleGain: number | undefined;
}

test("scénario de référence : versements, ventes, réinvestissement, dividende et retrait", () => {
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
    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const call = async (method, path, body) => {
        const response = await fetch(baseUrl + path, { method, headers: { "Content-Type": "application/json", Cookie: alice.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
        const text = await response.text();
        if (!response.ok) throw new Error(method + " " + path + " -> " + response.status + " " + text);
        return text ? JSON.parse(text) : undefined;
      };
      const ensure = (symbol) => call("POST", "/api/portfolio/positions/ensure", { symbol, name: symbol, currency: "EUR" });
      try {
        await call("POST", "/api/cash/movements", { type: "deposit", amount: 1000, effectiveAt: "2026-01-01T09:00:00.000Z" });
        const a = await ensure("AAA.PA");
        await call("POST", \`/api/portfolio/positions/\${a.id}/transactions\`, { tradedAt: "2026-01-02T10:00:00.000Z", type: "buy", quantity: 10, price: 100, totalFees: 0, currency: "EUR" });
        await call("POST", \`/api/portfolio/positions/\${a.id}/transactions\`, { tradedAt: "2026-02-01T10:00:00.000Z", type: "sell", quantity: 10, price: 120, totalFees: 0, currency: "EUR" });
        const b = await ensure("BBB.PA");
        await call("POST", \`/api/portfolio/positions/\${b.id}/transactions\`, { tradedAt: "2026-02-02T10:00:00.000Z", type: "buy", quantity: 9, price: 100, totalFees: 0, currency: "EUR" });
        await call("POST", "/api/cash/movements", { type: "dividend", amount: 30, effectiveAt: "2026-03-01T09:00:00.000Z", positionId: b.id });
        await call("POST", "/api/cash/movements", { type: "withdrawal", amount: 100, effectiveAt: "2026-04-01T09:00:00.000Z" });

        const ledger = await call("GET", "/api/cash");
        const full = await call("GET", "/api/portfolio/full?range=1d");
        const positionB = full.summary.positions.find((row) => row.symbol === "BBB.PA");
        console.log("__RESULT__" + JSON.stringify({
          cash: ledger.summary,
          depositCount: ledger.entries.filter((entry) => entry.kind === "deposit").length,
          positionB: { quantity: positionB.quantity, costBasis: positionB.costBasis, marketValue: positionB.marketValue },
          positionACount: full.summary.positions.filter((row) => row.symbol === "AAA.PA" && row.quantity > 0).length,
          pea: full.summary.pea,
          saleGain: ledger.entries.find((entry) => entry.kind === "sell")?.realizedGain
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as ScenarioResult;

  assert.equal(result.cash.status, "ready");
  assert.equal(result.cash.deposits, 1000);
  assert.equal(result.cash.withdrawals, 100);
  assert.equal(result.cash.netDeposits, 900);
  assert.equal(result.cash.cash, 230);
  assert.equal(result.cash.cashDividends, 30);
  assert.equal(result.cash.realizedGain, 200);
  assert.equal(result.saleGain, 200);
  assert.equal(result.cash.remainingCeiling, 149_000);
  assert.equal(result.depositCount, 1, "aucun versement supplémentaire créé par le réinvestissement");
  assert.equal(result.positionB.costBasis, 900);
  assert.equal(result.positionACount, 0);
  assert.equal(result.pea.totalValue, result.pea.positionsValue + result.pea.cash, "valeur PEA = positions + espèces");
  assert.equal(result.pea.positionsValue, result.positionB.marketValue);
  // Valeur 900 (9 × 100) + 230 espèces + 100 retirés - 1 000 versés : la plus-value réalisée n'est comptée qu'une fois.
  assert.equal(result.pea.globalGain, 230);
});
