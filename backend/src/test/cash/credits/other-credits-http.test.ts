import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";
import { sessionUserHelpers } from "../../helpers/session-users.js";

interface Summary { cash: number; deposits: number; netDeposits: number; cashDividends: number; otherCredits: number; remainingCeiling: number }
interface Entry { kind: string; amount: number; symbol?: string; absorbed: boolean }

interface Result {
  created: { summary: Summary; entries: Entry[] };
  pea: { globalGain: number; annualizedReturnPercent?: number; simpleReturnPercent?: number };
  peaWithoutCredits: { annualizedReturnPercent?: number };
  invalidType: number;
  foreignPosition: number;
  bobSummary: Summary;
  beforeStart: { status: number; absorbed: boolean[]; cash: number; otherCredits: number; implied: number; otherCreditsDeducted: number };
}

test("remboursements de capital et indemnisations : crédits ni versements ni dividendes, saisis avec un actif facultatif", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { peaOverview } = await import("./services/cash/pea-overview.ts");
    ${sessionUserHelpers}
    const alice = createUserWithSession("alice");
    const bob = createUserWithSession("bob");
    const carol = createUserWithSession("carol");
    const position = (userId, symbol) => {
      db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, ?, ?, 0, 0, 'EUR')").run(userId, symbol, symbol);
      return db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = ?").get(userId, symbol).id;
    };
    const engie = position(alice.id, "ENGI.PA");
    const bobPosition = position(bob.id, "BOB.PA");
    const now = new Date("2026-10-20T12:00:00.000Z");

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const request = async (session, method, path, body) => {
        const response = await fetch(baseUrl + path, { method, headers: { "Content-Type": "application/json", Cookie: session.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : undefined };
      };
      const movement = (session, body) => request(session, "POST", "/api/cash/movements", body);
      try {
        await movement(alice, { type: "deposit", amount: 1000, effectiveAt: "2025-01-02T09:00:00.000Z" });
        const xirrBase = peaOverview(alice.id, 0, 0, now);
        await movement(alice, { type: "capital_repayment", amount: 61.25, effectiveAt: "2025-05-06T12:00:00.000Z", positionId: engie });
        const created = (await movement(alice, { type: "compensation", amount: 65.53, effectiveAt: "2025-06-10T12:00:00.000Z" })).body;
        const invalidType = (await movement(alice, { type: "bonus", amount: 10, effectiveAt: "2025-06-10T12:00:00.000Z" })).status;
        const foreignPosition = (await movement(alice, { type: "capital_repayment", amount: 10, effectiveAt: "2025-06-10T12:00:00.000Z", positionId: bobPosition })).status;
        const bobSummary = (await request(bob, "GET", "/api/cash")).body.summary;

        // Compte avec état initial : un remboursement antérieur est résumé, puis déduit des dividendes déjà perçus.
        await request(carol, "PUT", "/api/cash/account", { referenceAt: "2026-03-01T00:00:00.000Z", cash: 200, deposits: 1000, withdrawals: 0 });
        const before = await movement(carol, { type: "capital_repayment", amount: 51.04, effectiveAt: "2025-05-05T12:00:00.000Z" });
        const estimate = (await request(carol, "GET", "/api/cash/account/opening-dividends")).body;
        const carolLedger = (await request(carol, "GET", "/api/cash")).body;

        console.log("__RESULT__" + JSON.stringify({
          created,
          pea: peaOverview(alice.id, 0, 0, now),
          peaWithoutCredits: xirrBase,
          invalidType,
          foreignPosition,
          bobSummary,
          beforeStart: {
            status: before.status,
            absorbed: carolLedger.entries.filter((entry) => entry.kind === "capital_repayment").map((entry) => entry.absorbed),
            cash: carolLedger.summary.cash,
            otherCredits: carolLedger.summary.otherCredits,
            implied: estimate.implied,
            otherCreditsDeducted: estimate.otherCredits
          }
        }));
      } finally {
        server.close();
      }
    });
  `) as Result;

  const { summary, entries } = result.created;
  // 1 000 versés + 61,25 + 65,53 : le solde augmente, ni les versements ni les dividendes.
  assert.deepEqual([summary.cash, summary.deposits, summary.netDeposits, summary.cashDividends, summary.otherCredits, summary.remainingCeiling], [1126.78, 1000, 1000, 0, 126.78, 149_000]);
  const repayment = entries.find((entry) => entry.kind === "capital_repayment");
  assert.deepEqual([repayment?.amount, repayment?.symbol], [61.25, "ENGI.PA"]);
  assert.equal(entries.find((entry) => entry.kind === "compensation")?.symbol, undefined, "l'actif est facultatif");
  // Gain global = valeur (espèces) - versements ; le TRI n'utilise que les versements et retraits.
  assert.equal(result.pea.globalGain, 126.78);
  assert.ok(result.pea.annualizedReturnPercent !== undefined && result.pea.annualizedReturnPercent > 0);
  assert.ok(Math.abs(result.peaWithoutCredits.annualizedReturnPercent ?? Number.NaN) < 1e-6, "sans crédit, rendement nul : les crédits ne sont jamais des versements");

  assert.equal(result.invalidType, 400);
  assert.equal(result.foreignPosition, 404, "la position d'un autre utilisateur est introuvable");
  assert.deepEqual([result.bobSummary.cash, result.bobSummary.otherCredits], [0, 0], "un autre utilisateur ne voit rien");

  assert.equal(result.beforeStart.status, 201, "un crédit antérieur à l'état initial peut être enregistré");
  assert.deepEqual(result.beforeStart.absorbed, [true]);
  assert.deepEqual([result.beforeStart.cash, result.beforeStart.otherCredits], [200, 0], "résumé par l'état initial : sans effet sur le solde ni l'indicateur");
  assert.equal(result.beforeStart.otherCreditsDeducted, 51.04);
  // 200 - 1 000 (aucun achat) - 51,04 : le remboursement n'est pas compté comme dividende.
  assert.equal(result.beforeStart.implied, -851.04);
});
