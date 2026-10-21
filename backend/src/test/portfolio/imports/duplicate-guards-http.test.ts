import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";
import { sessionUserHelpers } from "../../helpers/session-users.js";

interface Reply { status: number; body: { message?: string; details?: Record<string, unknown> } }
interface GuardResult {
  duplicate: Reply;
  confirmed: number;
  editDuplicate: Reply;
  other: number;
  bobDuplicate: number;
  trades: number;
  avisUploads: Reply;
  statementUploads: Reply;
}

test("une opération identique exige une confirmation et un même fichier ne peut pas être envoyé deux fois", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    ${sessionUserHelpers}
    const alice = createUserWithSession("alice");
    const bob = createUserWithSession("bob");
    const position = (userId) => {
      db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'BN.PA', 'Danone', 0, 0, 'EUR')").run(userId);
      const id = db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = 'BN.PA'").get(userId).id;
      // Compte espèces en attente (opérations antérieures) : aucun contrôle de fonds dans ce test.
      db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source) VALUES (?, 'buy', 2, 60.1, 0.48, 'EUR', '2026-09-15T08:33:37.000Z', 'manual')").run(id);
      return id;
    };
    const alicePosition = position(alice.id);
    const bobPosition = position(bob.id);
    const trade = { tradedAt: "2026-09-15T14:00:00.000Z", type: "buy", quantity: 2, price: 60.1, totalFees: 0.48, currency: "EUR" };

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const send = async (user, path, method, body) => {
        const response = await fetch(baseUrl + path, { method, headers: { "Content-Type": "application/json", Cookie: user.cookie }, body: JSON.stringify(body) });
        return { status: response.status, body: response.status === 204 ? {} : await response.json() };
      };
      const upload = async (path) => {
        const form = new FormData();
        const pdf = new Uint8Array(Buffer.from("%PDF-1.4 meme contenu"));
        form.append("files", new Blob([pdf], { type: "application/pdf" }), "avis-1.pdf");
        form.append("files", new Blob([pdf], { type: "application/pdf" }), "avis-1-copie.pdf");
        const response = await fetch(baseUrl + path, { method: "POST", headers: { Cookie: alice.cookie }, body: form });
        return { status: response.status, body: await response.json() };
      };
      try {
        const path = \`/api/portfolio/positions/\${alicePosition}/transactions\`;
        const duplicate = await send(alice, path, "POST", trade);
        const confirmed = (await send(alice, path, "POST", { ...trade, confirmDuplicate: true })).status;
        const rows = db.prepare("SELECT id FROM transactions WHERE position_id = ? ORDER BY id").all(alicePosition);
        // Modifier le doublon confirmé pour le rendre identique à l'original exige aussi la confirmation.
        const editDuplicate = await send(alice, path + "/" + rows[1].id, "PUT", { ...trade, tradedAt: "2026-09-15T08:33:37.000Z" });
        const other = (await send(alice, path, "POST", { ...trade, tradedAt: "2026-09-15T15:00:00.000Z", price: 61 })).status;
        const bobDuplicate = (await send(bob, \`/api/portfolio/positions/\${bobPosition}/transactions\`, "POST", trade)).status;
        const trades = db.prepare("SELECT COUNT(*) AS total FROM transactions WHERE position_id = ?").get(alicePosition).total;
        console.log("__RESULT__" + JSON.stringify({
          duplicate, confirmed, editDuplicate, other, bobDuplicate, trades,
          avisUploads: await upload("/api/import/avis-operes/preview"),
          statementUploads: await upload("/api/cash/dividend-statements/preview")
        }));
      } finally {
        server.close();
      }
    });
  `) as GuardResult;

  assert.equal(result.duplicate.status, 409, "même jour, même quantité, même cours : refus sans confirmation");
  assert.equal(result.duplicate.body.details?.["code"], "DUPLICATE_TRANSACTION");
  assert.equal(result.confirmed, 201, "la confirmation explicite enregistre l'opération");
  assert.equal(result.editDuplicate.status, 409);
  assert.equal(result.editDuplicate.body.details?.["code"], "DUPLICATE_TRANSACTION");
  assert.equal(result.other, 201, "un autre cours n'est pas un doublon");
  assert.equal(result.bobDuplicate, 409, "chaque utilisateur est comparé à ses propres opérations");
  assert.equal(result.trades, 3);
  for (const reply of [result.avisUploads, result.statementUploads]) {
    assert.equal(reply.status, 400);
    assert.deepEqual(reply.body.details, { code: "DUPLICATE_UPLOAD", files: ["avis-1.pdf", "avis-1-copie.pdf"] });
  }
});
