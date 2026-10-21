import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";
import { sessionUserHelpers } from "../../helpers/session-users.js";

interface Response { status: number; body: { error?: string; details?: { code?: string }; statements?: { lines: { key: string; case: string }[] }[]; created?: number; verified?: number } }
interface Result {
  notPdf: number;
  duplicateUpload: Response;
  pending: number;
  preview: { status: number; cases: string[]; writes: number };
  badDecisions: number;
  confirm: Response;
  bobPreview: string[];
  aliceMovements: number;
  bobMovements: number;
  deleteTradeRefused: Response;
  deleteTrade: number;
  deleteMovementRefused: Response;
  deleteMovement: number;
  aliceCheck: { status: number; oldest: { period: string; status: string; appBalance: number } };
  bobCheck: { status: number; months: number };
  anonymousCheck: number;
}

test("API des relevés espèces : fichiers refusés, aperçu sans écriture, confirmation, contrôle mensuel, isolation et suppression confirmée", () => {
  const result = runBackendScript(`
    process.execArgv = ["--import", "tsx"];
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { linesPdf } = await import("./test/helpers/statement-pdf.ts");
    ${sessionUserHelpers}
    const alice = createUserWithSession("alice");
    const bob = createUserWithSession("bob");
    const carol = createUserWithSession("carol");
    db.prepare("INSERT INTO cash_accounts (user_id, status) VALUES (?, 'ready')").run(alice.id);
    db.prepare("INSERT INTO cash_accounts (user_id, status) VALUES (?, 'ready')").run(bob.id);
    db.prepare("INSERT INTO cash_accounts (user_id, status) VALUES (?, 'pending')").run(carol.id);
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'BN.PA', 'Danone', 2, 59.5, 'EUR')").run(alice.id);
    const positionId = db.prepare("SELECT id FROM positions WHERE user_id = ?").get(alice.id).id;
    db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at) VALUES (?, 'buy', 2, 59.5, 1, 'EUR', '2024-03-06T09:00:00.000Z')").run(positionId);
    const tradeId = db.prepare("SELECT id FROM transactions WHERE position_id = ?").get(positionId).id;
    const pdf = linesPdf([
      "RELEVE COMPTE ESPECES : MARS 2024", "Feuillet 1/1", "29/02/2024 ANCIEN SOLDE 0,00",
      "05/03/2024 VIR VIREMENT CREATION COMPTE 300,00", "06/03/2024 ACHAT COMPTANT 2 DANONE 120,00", "31/03/2024 NOUVEAU SOLDE 180,00"
    ]);
    const statementFile = { content: pdf, type: "application/pdf", name: "releve.pdf" };
    const movements = (userId) => db.prepare("SELECT COUNT(*) AS n FROM cash_movements WHERE user_id = ?").get(userId).n;

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const post = async (path, user, files, fields = {}) => {
        const form = new FormData();
        for (const file of files) form.append("files", new Blob([file.content], { type: file.type }), file.name);
        for (const [name, value] of Object.entries(fields)) form.append(name, value);
        const response = await fetch(baseUrl + path, { method: "POST", headers: { Cookie: user.cookie, Origin: baseUrl }, body: form });
        return { status: response.status, body: await response.json() };
      };
      const remove = async (path, user) => {
        const response = await fetch(baseUrl + path, { method: "DELETE", headers: { Cookie: user.cookie, Origin: baseUrl } });
        return { status: response.status, body: response.status === 204 ? {} : await response.json() };
      };
      const get = async (path, user) => {
        const response = await fetch(baseUrl + path, { headers: user ? { Cookie: user.cookie } : {} });
        return { status: response.status, body: await response.json() };
      };
      try {
        const notPdf = await post("/api/cash/cash-statements/preview", alice, [{ content: "texte", type: "text/plain", name: "releve.txt" }]);
        const duplicateUpload = await post("/api/cash/cash-statements/preview", alice, [statementFile, { ...statementFile, name: "copie.pdf" }]);
        const pending = await post("/api/cash/cash-statements/preview", carol, [statementFile]);
        const preview = await post("/api/cash/cash-statements/preview", alice, [statementFile]);
        const writes = db.prepare("SELECT COUNT(*) AS n FROM cash_statements").get().n + movements(alice.id);
        const badDecisions = await post("/api/cash/cash-statements/confirm", alice, [statementFile], { decisions: "{" });
        const lines = preview.body.statements[0].lines.map((line) => ({ key: line.key, apply: true }));
        const confirm = await post("/api/cash/cash-statements/confirm", alice, [statementFile], { decisions: JSON.stringify({ lines }) });
        const bobPreview = await post("/api/cash/cash-statements/preview", bob, [statementFile]);
        const aliceCheck = await get("/api/cash/cash-statements/monthly-check", alice);
        const bobCheck = await get("/api/cash/cash-statements/monthly-check", bob);
        const anonymousCheck = await get("/api/cash/cash-statements/monthly-check");
        const depositId = db.prepare("SELECT id FROM cash_movements WHERE user_id = ? AND type = 'deposit'").get(alice.id).id;
        const tradePath = \`/api/portfolio/positions/\${positionId}/transactions/\${tradeId}\`;
        const deleteTradeRefused = await remove(tradePath, alice);
        const deleteTrade = await remove(tradePath + "?confirmUnverify=true", alice);
        const deleteMovementRefused = await remove(\`/api/cash/movements/\${depositId}\`, alice);
        const deleteMovement = await remove(\`/api/cash/movements/\${depositId}?confirmUnverify=true\`, alice);
        console.log("__RESULT__" + JSON.stringify({
          notPdf: notPdf.status, duplicateUpload, pending: pending.status,
          preview: { status: preview.status, cases: preview.body.statements[0].lines.map((line) => line.case), writes },
          badDecisions: badDecisions.status, confirm,
          bobPreview: bobPreview.body.statements[0].lines.map((line) => line.case),
          aliceMovements: movements(alice.id), bobMovements: movements(bob.id),
          deleteTradeRefused, deleteTrade: deleteTrade.status, deleteMovementRefused, deleteMovement: deleteMovement.status,
          aliceCheck: { status: aliceCheck.status, oldest: aliceCheck.body.months.at(-1) },
          bobCheck: { status: bobCheck.status, months: bobCheck.body.months.length },
          anonymousCheck: anonymousCheck.status
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as Result;

  assert.equal(result.notPdf, 400);
  assert.equal(result.duplicateUpload.status, 400);
  assert.equal(result.duplicateUpload.body.details?.code, "DUPLICATE_UPLOAD", "un même fichier deux fois dans un lot est refusé");
  assert.equal(result.pending, 409, "compte espèces non configuré");
  assert.deepEqual(result.preview, { status: 200, cases: ["create", "verify"], writes: 0 });
  assert.equal(result.badDecisions, 400);
  assert.equal(result.confirm.status, 200);
  assert.equal(result.confirm.body.created, 1);
  assert.equal(result.confirm.body.verified, 1);
  assert.deepEqual(result.bobPreview, ["create", "missing_trade"], "Bob ne voit ni l'achat ni le versement d'Alice");
  assert.equal(result.bobMovements, 0);
  assert.equal(result.aliceCheck.status, 200);
  assert.deepEqual([result.aliceCheck.oldest.period, result.aliceCheck.oldest.status, result.aliceCheck.oldest.appBalance], ["2024-03", "ok", 180], "contrôle mensuel du relevé importé");
  assert.deepEqual(result.bobCheck, { status: 200, months: 0 }, "Bob ne voit pas le contrôle d'Alice");
  assert.equal(result.anonymousCheck, 401);
  assert.equal(result.deleteTradeRefused.status, 409);
  assert.equal(result.deleteTradeRefused.body.details?.code, "CASH_STATEMENT_VERIFIED");
  assert.equal(result.deleteTrade, 204);
  assert.equal(result.deleteMovementRefused.status, 409);
  assert.equal(result.deleteMovement, 200);
  assert.equal(result.aliceMovements, 0, "le versement créé puis supprimé avec confirmation a disparu");
});
