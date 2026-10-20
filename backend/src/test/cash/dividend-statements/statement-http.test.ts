import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";
import { sessionUserHelpers } from "../../helpers/session-users.js";

interface Result {
  notPdf: { status: number; error: string };
  disguised: number;
  tooHeavy: number;
  otherUser: number;
  verifyOtherUser: number;
  preview: { status: number; cases: string[]; movementsAfter: number };
  badDecisions: number;
  confirm: { status: number; created: number; certified: number; movements: { symbol: string; verification: string }[] };
  check: { status: number; outcome: string };
}

test("API des relevés : fichiers refusés, appartenance, aperçu sans écriture et confirmation qui écrit", () => {
  const result = runBackendScript(`
    // Le processus enfant d'extraction PDF hérite des options de Node : sans le script « -e » de
    // ce test, il exécute bien son propre fichier.
    process.execArgv = ["--import", "tsx"];
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { linesPdf, syntheticStatementLines } = await import("./test/helpers/statement-pdf.ts");
    ${sessionUserHelpers}
    const alice = createUserWithSession("alice");
    const bob = createUserWithSession("bob");
    db.prepare("INSERT INTO cash_accounts (user_id, status, reference_at) VALUES (?, 'ready', '2026-03-01T00:00:00.000Z')").run(alice.id);
    db.prepare("INSERT INTO cash_accounts (user_id, status) VALUES (?, 'ready')").run(bob.id);
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency, isin) VALUES (?, 'TTE.PA', 'TotalEnergies', 45, 50, 'EUR', 'FR0000120271')").run(alice.id);
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency, isin) VALUES (?, 'FDJ.PA', 'FDJ', 35, 30, 'EUR', 'FR0013451333')").run(alice.id);
    db.prepare("INSERT INTO cash_movements (user_id, type, amount_cents, effective_at, symbol, source) VALUES (?, 'dividend', 3825, '2026-03-31T09:00:00.000Z', 'TTE.PA', 'manual')").run(alice.id);
    const aliceDividend = db.prepare("SELECT id FROM cash_movements WHERE user_id = ?").get(alice.id).id;
    const pdf = linesPdf(syntheticStatementLines);
    const movements = () => db.prepare("SELECT symbol, verification FROM cash_movements WHERE user_id = ? ORDER BY id").all(alice.id);

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const post = async (path, user, files, fields = {}, field = "files") => {
        const form = new FormData();
        for (const file of files) form.append(field, new Blob([file.content], { type: file.type }), file.name);
        for (const [name, value] of Object.entries(fields)) form.append(name, value);
        const response = await fetch(baseUrl + path, { method: "POST", headers: { Cookie: user.cookie, Origin: baseUrl }, body: form });
        return { status: response.status, body: await response.json() };
      };
      const statementFile = { content: pdf, type: "application/pdf", name: "releve.pdf" };
      try {
        const notPdf = await post("/api/cash/dividend-statements/preview", alice, [{ content: "texte", type: "text/plain", name: "releve.txt" }]);
        const disguised = await post("/api/cash/dividend-statements/preview", alice, [{ content: "pas un pdf", type: "application/pdf", name: "releve.pdf" }]);
        const tooHeavy = await post("/api/cash/dividend-statements/preview", alice, [{ content: Buffer.concat([pdf, Buffer.alloc(2 * 1024 * 1024)]), type: "application/pdf", name: "releve.pdf" }]);
        const otherUser = await post(\`/api/cash/movements/\${aliceDividend}/statement-check\`, bob, [statementFile], {}, "file");
        const verifyOtherUser = (await fetch(baseUrl + \`/api/cash/movements/\${aliceDividend}/verify\`, { method: "POST", headers: { Cookie: bob.cookie, Origin: baseUrl, "Content-Type": "application/json" }, body: "{}" })).status;
        const preview = await post("/api/cash/dividend-statements/preview", alice, [statementFile]);
        const movementsAfterPreview = movements().length;
        const badDecisions = await post("/api/cash/dividend-statements/confirm", alice, [statementFile], { decisions: "{" });
        const decisions = { lines: preview.body.statements[0].lines.map((line) => ({ key: line.key, apply: true })), certifyOpening: false };
        const confirm = await post("/api/cash/dividend-statements/confirm", alice, [statementFile], { decisions: JSON.stringify(decisions) });
        const check = await post(\`/api/cash/movements/\${aliceDividend}/statement-check\`, alice, [statementFile], {}, "file");
        console.log("__RESULT__" + JSON.stringify({
          notPdf: { status: notPdf.status, error: notPdf.body.error }, disguised: disguised.status, tooHeavy: tooHeavy.status,
          otherUser: otherUser.status, verifyOtherUser,
          preview: { status: preview.status, cases: preview.body.statements[0].lines.map((line) => line.case), movementsAfter: movementsAfterPreview },
          badDecisions: badDecisions.status,
          confirm: { status: confirm.status, created: confirm.body.created, certified: confirm.body.certified, movements: movements() },
          check: { status: check.status, outcome: check.body.outcome }
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as Result;

  assert.equal(result.notPdf.status, 400);
  assert.equal(result.disguised, 400, "un faux PDF (signature absente) est refusé avant analyse");
  assert.equal(result.tooHeavy, 400);
  assert.equal(result.otherUser, 404);
  assert.equal(result.verifyOtherUser, 404);
  assert.deepEqual(result.preview, { status: 200, cases: ["certify", "create"], movementsAfter: 1 });
  assert.equal(result.badDecisions, 400);
  assert.equal(result.confirm.status, 200);
  assert.deepEqual([result.confirm.created, result.confirm.certified], [1, 1]);
  assert.deepEqual(result.confirm.movements, [{ symbol: "TTE.PA", verification: "document" }, { symbol: "FDJ.PA", verification: "document" }]);
  assert.deepEqual(result.check, { status: 200, outcome: "already_certified" });
});
