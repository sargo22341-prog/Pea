import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

test("deleting a transaction is rejected when a later sale would exceed the held quantity", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";
    import { db } from "./db.ts";
    import { runWithUser } from "./services/auth/user-context.ts";
    import { portfolioService } from "./services/portfolio/portfolio.service.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const user = await setup.json();
        const position = await runWithUser(user.id, () => portfolioService.ensurePosition("AIR.PA", "Air Liquide", "EUR"));
        const transactionsUrl = \`\${baseUrl}/api/portfolio/positions/\${position.id}/transactions\`;
        const post = (body) => fetch(transactionsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ totalFees: 0, currency: "EUR", ...body })
        });
        const remove = (id) => fetch(\`\${transactionsUrl}/\${id}\`, { method: "DELETE", headers: { Cookie: cookie } });

        await post({ tradedAt: "2026-01-10T10:00:00.000Z", type: "buy", quantity: 10, price: 100 });
        const afterSell = await (await post({ tradedAt: "2026-01-15T10:00:00.000Z", type: "sell", quantity: 8, price: 110 })).json();
        const buy = afterSell.find((row) => row.type === "buy");
        const sell = afterSell.find((row) => row.type === "sell");

        const rejectedDelete = await remove(buy.id);
        const rejectedBody = await rejectedDelete.json();
        const quantityAfterRejection = db.prepare("SELECT quantity FROM positions WHERE id = ?").get(position.id).quantity;
        const missingDelete = await remove(999999);
        const acceptedDelete = await remove(sell.id);
        const quantityAfterSellDeletion = db.prepare("SELECT quantity FROM positions WHERE id = ?").get(position.id).quantity;

        console.log("__RESULT__" + JSON.stringify({
          rejectedStatus: rejectedDelete.status,
          rejectedMessage: rejectedBody.message,
          quantityAfterRejection,
          missingStatus: missingDelete.status,
          acceptedStatus: acceptedDelete.status,
          quantityAfterSellDeletion
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.rejectedStatus, 400);
  assert.match(result.rejectedMessage, /suppression rendrait la quantite detenue negative/);
  assert.equal(result.quantityAfterRejection, 2);
  assert.equal(result.missingStatus, 404);
  assert.equal(result.acceptedStatus, 204);
  assert.equal(result.quantityAfterSellDeletion, 10);
});
