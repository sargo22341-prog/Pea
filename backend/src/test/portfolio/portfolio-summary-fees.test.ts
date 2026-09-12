import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript } from "../helpers/backend-script.js";

test("portfolio summary totals transaction fees of the current user only", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    ${helpers}

    yahooApi.quote = async (symbol) => pricedQuoteRow(symbol, "CLOSED", 100);
    yahooApi.quoteBatchRaw = async (symbols) => symbols.map((symbol) => pricedQuoteRow(symbol, "CLOSED", 100));
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });
    yahooApi.quoteSummary = async () => ({ profile: {}, raw: {} });

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "tester", password: "correct horse battery staple", confirmPassword: "correct horse battery staple" })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const owner = db.prepare("SELECT id FROM users WHERE username = 'tester'").get();
        db.prepare("INSERT INTO users (username, password_hash) VALUES ('other', 'hash')").run();
        const other = db.prepare("SELECT id FROM users WHERE username = 'other'").get();

        function addPosition(userId, symbol, fees) {
          db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, ?, ?, 1, 10, 'EUR')").run(userId, symbol, symbol);
          const position = db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = ?").get(userId, symbol);
          for (const fee of fees) {
            db.prepare(
              "INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source) VALUES (?, 'buy', 1, 10, ?, 'EUR', '2026-01-10T10:00:00.000Z', 'manual')"
            ).run(position.id, fee);
          }
        }
        addPosition(owner.id, "AAA.PA", [1.5, 0.25]);
        addPosition(owner.id, "BBB.PA", [2, 0]);
        addPosition(other.id, "CCC.PA", [100]);

        const response = await fetch(\`\${baseUrl}/api/portfolio?range=1d\`, { headers: { Cookie: cookie } });
        const body = await response.json();
        console.log("__RESULT__" + JSON.stringify({ status: response.status, totalFees: body.totalFees, assetsCount: body.assetsCount }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } });

  assert.equal(result.status, 200);
  assert.equal(result.assetsCount, 2);
  assert.equal(result.totalFees, 3.75);
});
