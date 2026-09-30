import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript } from "../../helpers/backend-script.js";
import { sessionUserHelpers } from "../../helpers/session-users.js";

interface Holding {
  quantity: number;
  averageBuyPrice: number;
}

interface CsvImportResult {
  anonymousStatus: number;
  anonymousLargeStatus: number;
  overLimitStatus: number;
  replace: { imported: string[]; errors: { line: number; message: string }[] };
  afterReplace: Holding;
  aaaTransactions: { source: string; type: string; quantity: number }[];
  afterSell: Holding;
  afterMerge: Holding;
  updatePreview: { symbol: string; currentQuantity: number; proposedAction: string }[];
  afterUpdate: Holding;
  bobHolding: Holding;
}

test("CSV holdings imports append transactions instead of overwriting positions", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { marketDataGateway } = await import("./services/market/data/market-data-gateway.service.ts");
    ${helpers}
    ${sessionUserHelpers}
    yahooApi.quote = async (symbol) => pricedQuoteRow(symbol, "CLOSED", 100);
    yahooApi.quoteBatchRaw = async (symbols) => symbols.map((symbol) => pricedQuoteRow(symbol, "CLOSED", 100));
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });
    yahooApi.quoteSummary = async () => ({ profile: {}, raw: {} });
    marketDataGateway.readQuoteWithCache = async (symbol) => ({ data: { symbol: symbol === "ZZZ.PA" ? "OTHER" : symbol } });
    marketDataGateway.search = async (query) => ({ data: [{ symbol: query === "FR0000000001" ? "AAA.PA" : "BBB.PA", name: query, exchange: "PAR", quoteType: "EQUITY", currency: "EUR" }] });

    const alice = createUserWithSession("alice");
    const bob = createUserWithSession("bob");
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'AAA.PA', 'AAA', 10, 100, 'EUR')").run(alice.id);
    const aaaId = db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = 'AAA.PA'").get(alice.id).id;
    db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source) VALUES (?, 'buy', 10, 100, 0, 'EUR', '2025-01-10T10:00:00.000Z', 'manual')").run(aaaId);

    function csvRow(line, symbol, quantity, buyingPrice, action) {
      return { line, name: symbol + " SA", isin: "FR00000000" + line, quantity, buyingPrice, lastPrice: 100, intradayVariation: 0, amount: 0, amountVariation: 0, variation: 0, symbol, needsReview: false, errors: [], action };
    }

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const call = (path, cookie, body) => fetch(baseUrl + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const holding = async (cookie, symbol) => {
        const positions = (await (await call("/api/portfolio/full?range=1d", cookie)).json()).summary.positions;
        const position = positions.find((row) => row.symbol === symbol);
        return { quantity: position.quantity, averageBuyPrice: position.averageBuyPrice };
      };
      try {
        const anonymousStatus = (await fetch(baseUrl + "/api/import/boursorama/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: [] }) })).status;
        const overLimitRows = Array.from({ length: 1001 }, (_, index) => csvRow(index + 1, "AAA.PA", 1, 1));
        const anonymousLargeStatus = (await fetch(baseUrl + "/api/import/boursorama/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: overLimitRows }) })).status;
        const overLimitStatus = (await call("/api/import/boursorama/confirm", alice.cookie, { rows: overLimitRows })).status;

        const replace = await (await call("/api/import/boursorama/confirm", alice.cookie, {
          rows: [csvRow(1, "AAA.PA", 50, 110, "replace"), csvRow(2, "BBB.PA", 5, 20), csvRow(3, "ZZZ.PA", 1, 1)]
        })).json();
        const afterReplace = await holding(alice.cookie, "AAA.PA");
        const aaaTransactions = (await (await call(\`/api/portfolio/positions/\${aaaId}/transactions\`, alice.cookie)).json())
          .map((row) => ({ source: row.source, type: row.type, quantity: row.quantity }));

        await call(\`/api/portfolio/positions/\${aaaId}/transactions\`, alice.cookie, { tradedAt: new Date().toISOString(), type: "sell", quantity: 5, price: 120, currency: "EUR" });
        const afterSell = await holding(alice.cookie, "AAA.PA");

        await call("/api/import/boursorama/confirm", alice.cookie, { rows: [csvRow(1, "BBB.PA", 5, 30, "merge")] });
        const afterMerge = await holding(alice.cookie, "BBB.PA");

        const content = "name;isin;quantity;buyingPrice;lastPrice;intradayVariation;amount;amountVariation;variation\\nAAA SA;FR0000000001;40;110;100;0;0;0;0";
        const updatePreview = await (await call("/api/import/boursorama/update-preview", alice.cookie, { content })).json();
        await call("/api/import/boursorama/update-confirm", alice.cookie, { rows: updatePreview.filter((row) => row.symbol === "AAA.PA") });
        const afterUpdate = await holding(alice.cookie, "AAA.PA");

        await call("/api/import/boursorama/confirm", bob.cookie, { rows: [csvRow(1, "AAA.PA", 3, 10, "replace")] });
        const bobHolding = await holding(bob.cookie, "AAA.PA");

        console.log("__RESULT__" + JSON.stringify({
          anonymousStatus, anonymousLargeStatus, overLimitStatus, replace, afterReplace, aaaTransactions, afterSell, afterMerge,
          updatePreview: updatePreview.map((row) => ({ symbol: row.symbol, currentQuantity: row.currentQuantity, proposedAction: row.proposedAction })),
          afterUpdate, bobHolding
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as CsvImportResult;

  assert.equal(result.anonymousStatus, 401);
  assert.equal(result.anonymousLargeStatus, 401, "a large import body is only read for an authenticated user");
  assert.equal(result.overLimitStatus, 400);
  assert.deepEqual(result.replace.imported, ["AAA.PA", "BBB.PA"]);
  assert.deepEqual(result.replace.errors.map((error) => error.line), [3]);
  assert.deepEqual(result.afterReplace, { quantity: 50, averageBuyPrice: 110 });
  assert.deepEqual(result.aaaTransactions.map((row) => row.source).sort(), ["csv", "manual"], "the manual history is kept next to the CSV adjustment");
  assert.deepEqual(result.afterSell.quantity, 45, "a sale after a CSV import starts from the imported quantity");
  assert.deepEqual(result.afterMerge, { quantity: 10, averageBuyPrice: 25 });
  assert.deepEqual(result.updatePreview.find((row) => row.symbol === "AAA.PA"), { symbol: "AAA.PA", currentQuantity: 45, proposedAction: "reduce" });
  assert.deepEqual(result.afterUpdate, { quantity: 40, averageBuyPrice: 110 });
  assert.deepEqual(result.bobHolding, { quantity: 3, averageBuyPrice: 10 });
});
