import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";
import { sessionUserHelpers } from "../../helpers/session-users.js";

interface Response { status: number; body: { eligible?: boolean; blockers?: { code: string }[]; details?: { code?: string; blockers?: { code: string }[] }; summary?: { historyIncomplete: boolean } } }
interface Result { anonymous: number; preview: Response; bobPreview: Response; noConfirm: number; bobConfirm: Response; confirm: Response; bobReference: string | null }

test("API de l'historique complet : authentification, aperçu, confirmation explicite et isolation", () => {
  const result = runBackendScript(`
    process.execArgv = ["--import", "tsx"];
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { parseCashStatement } = await import("./services/cash/cash-statements/parser/cash-statement-parser.ts");
    const { cashStatementsService } = await import("./services/cash/cash-statements/cash-statement-import.service.ts");
    ${sessionUserHelpers}
    const alice = createUserWithSession("alice");
    const bob = createUserWithSession("bob");
    for (const user of [alice, bob]) {
      db.prepare("INSERT INTO cash_accounts (user_id, status, reference_at, opening_cash_cents, opening_deposits_cents) VALUES (?, 'ready', '2024-03-31T20:00:00.000Z', 30000, 30000)").run(user.id);
    }
    const text = ["RELEVE COMPTE ESPECES : MARS 2024", "Feuillet 1/1", "29/02/2024 ANCIEN SOLDE 0,00", "05/03/2024 VIR VIREMENT CREATION COMPTE 300,00", "31/03/2024 NOUVEAU SOLDE 300,00"].join(String.fromCharCode(10));
    const read = { fileName: "releve.pdf", statement: parseCashStatement(text) };
    cashStatementsService.confirm(alice.id, [read], { lines: [] });

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const call = async (method, user, body) => {
        const headers = user ? { Cookie: user.cookie, Origin: baseUrl, "Content-Type": "application/json" } : {};
        const response = await fetch(baseUrl + "/api/cash/account/full-history", { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: response.status, body: await response.json() };
      };
      try {
        const anonymous = await call("GET");
        const preview = await call("GET", alice);
        const bobPreview = await call("GET", bob);
        const noConfirm = await call("POST", alice, {});
        const bobConfirm = await call("POST", bob, { confirm: true });
        const confirm = await call("POST", alice, { confirm: true });
        const bobReference = db.prepare("SELECT reference_at FROM cash_accounts WHERE user_id = ?").get(bob.id).reference_at;
        console.log("__RESULT__" + JSON.stringify({ anonymous: anonymous.status, preview, bobPreview, noConfirm: noConfirm.status, bobConfirm, confirm, bobReference }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as Result;

  assert.equal(result.anonymous, 401);
  assert.equal(result.preview.status, 200);
  assert.equal(result.preview.body.eligible, true, JSON.stringify(result.preview.body.blockers));
  assert.deepEqual(result.bobPreview.body.blockers?.map((blocker) => blocker.code), ["no_statements"], "Bob ne voit pas les relevés d'Alice");
  assert.equal(result.noConfirm, 400, "confirmation explicite obligatoire");
  assert.equal(result.bobConfirm.status, 409);
  assert.equal(result.bobConfirm.body.details?.code, "FULL_HISTORY_INELIGIBLE");
  assert.equal(result.bobReference, "2024-03-31T20:00:00.000Z", "l'état initial de Bob est intact");
  assert.equal(result.confirm.status, 200);
  assert.equal(result.confirm.body.summary?.historyIncomplete, false);
});
