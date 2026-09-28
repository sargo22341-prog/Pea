import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript } from "../../helpers/backend-script.js";
import { sessionUserHelpers } from "../../helpers/session-users.js";

interface SplitDecisionResult {
  aliceSplits: { id: number; symbol: string; status: string; numerator: number; denominator: number }[];
  bobSplits: unknown[];
  otherUserDecision: number;
  invalidDecision: number;
  invalidId: number;
  before: { quantity: number; performancePercent: number };
  applied: { status: number; body: { status: string } };
  after: { quantity: number; performancePercent: number };
  storedTransactionQuantity: number;
  storedPositionQuantity: number;
  transactionSplitFactor: number | null;
  chartCacheRows: number;
  ignored: { status: string };
  ignoredQuantity: number;
}

test("split decisions are limited to the current user's positions and adjust the valuation on read", () => {
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
    for (const symbol of ["AAA.PA", "BBB.PA"]) {
      db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES (?, ?, 'Paris', 'EUR')").run(symbol, symbol + " SA");
    }
    function addPosition(userId, symbol, quantity, price, tradedAt) {
      db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, ?, ?, ?, ?, 'EUR')").run(userId, symbol, symbol, quantity, price);
      const position = db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = ?").get(userId, symbol);
      db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source) VALUES (?, 'buy', ?, ?, 0, 'EUR', ?, 'manual')").run(position.id, quantity, price, tradedAt);
      return position.id;
    }
    const alicePosition = addPosition(alice.id, "AAA.PA", 10, 1000, "2024-01-15T10:00:00.000Z");
    addPosition(alice.id, "BBB.PA", 4, 200, "2024-01-15T10:00:00.000Z");
    addPosition(bob.id, "AAA.PA", 50, 100, "2024-07-01T10:00:00.000Z");
    const assetId = (symbol) => db.prepare("SELECT id FROM assets WHERE symbol = ?").get(symbol).id;
    db.prepare("INSERT INTO asset_splits (asset_id, split_date, numerator, denominator, source) VALUES (?, '2024-06-10', 10, 1, 'yahoo-chart')").run(assetId("AAA.PA"));
    db.prepare("INSERT INTO asset_splits (asset_id, split_date, numerator, denominator, source) VALUES (?, '2024-03-01', 2, 1, 'yahoo-chart')").run(assetId("BBB.PA"));
    db.prepare("INSERT INTO portfolio_chart_cache (cache_key, user_id, range, payload, cached_at, expires_at) VALUES ('probe', ?, '1d', '{}', 0, 9999999999999)").run(String(alice.id));

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const call = (path, cookie, init = {}) => fetch(baseUrl + path, { ...init, headers: { "Content-Type": "application/json", Cookie: cookie } });
      const decide = (id, cookie, body) => call(\`/api/splits/\${id}/decision\`, cookie, { method: "POST", body: JSON.stringify(body) });
      const aaaPosition = async () => (await (await call("/api/portfolio?range=1d", alice.cookie)).json()).positions.find((row) => row.symbol === "AAA.PA");
      try {
        const aliceSplits = await (await call("/api/splits", alice.cookie)).json();
        const bobSplits = await (await call("/api/splits", bob.cookie)).json();
        const aaaSplit = aliceSplits.find((split) => split.symbol === "AAA.PA");
        const bbbSplit = aliceSplits.find((split) => split.symbol === "BBB.PA");
        const otherUserDecision = (await decide(aaaSplit.id, bob.cookie, { decision: "apply" })).status;
        const invalidDecision = (await decide(aaaSplit.id, alice.cookie, { decision: "maybe" })).status;
        const invalidId = (await decide("abc", alice.cookie, { decision: "apply" })).status;
        const before = await aaaPosition();
        const appliedResponse = await decide(aaaSplit.id, alice.cookie, { decision: "apply" });
        const applied = { status: appliedResponse.status, body: await appliedResponse.json() };
        const after = await aaaPosition();
        const transactions = await (await call(\`/api/portfolio/positions/\${alicePosition}/transactions\`, alice.cookie)).json();
        const ignored = await (await decide(bbbSplit.id, alice.cookie, { decision: "ignore" })).json();
        const bbb = (await (await call("/api/portfolio?range=1d", alice.cookie)).json()).positions.find((row) => row.symbol === "BBB.PA");
        console.log("__RESULT__" + JSON.stringify({
          aliceSplits,
          bobSplits,
          otherUserDecision,
          invalidDecision,
          invalidId,
          before: { quantity: before.quantity, performancePercent: before.performancePercent },
          applied,
          after: { quantity: after.quantity, performancePercent: after.performancePercent },
          storedTransactionQuantity: db.prepare("SELECT quantity FROM transactions WHERE position_id = ?").get(alicePosition).quantity,
          storedPositionQuantity: db.prepare("SELECT quantity FROM positions WHERE id = ?").get(alicePosition).quantity,
          transactionSplitFactor: transactions[0]?.splitFactor ?? null,
          chartCacheRows: db.prepare("SELECT COUNT(*) AS count FROM portfolio_chart_cache WHERE user_id = ?").get(String(alice.id)).count,
          ignored,
          ignoredQuantity: bbb.quantity
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as SplitDecisionResult;

  assert.deepEqual(result.aliceSplits.map((split) => [split.symbol, split.status, split.numerator, split.denominator]), [
    ["AAA.PA", "pending", 10, 1],
    ["BBB.PA", "pending", 2, 1]
  ]);
  assert.deepEqual(result.bobSplits, [], "a position opened after the split is not concerned");
  assert.equal(result.otherUserDecision, 404);
  assert.equal(result.invalidDecision, 400);
  assert.equal(result.invalidId, 400);
  assert.equal(result.before.quantity, 10);
  assert.equal(result.before.performancePercent, -90);
  assert.equal(result.applied.status, 200);
  assert.equal(result.applied.body.status, "applied");
  assert.equal(result.after.quantity, 100);
  assert.equal(result.after.performancePercent, 0);
  assert.equal(result.storedTransactionQuantity, 10, "stored transactions are never rewritten");
  assert.equal(result.storedPositionQuantity, 100, "the position snapshot is recomputed");
  assert.equal(result.transactionSplitFactor, 10);
  assert.equal(result.chartCacheRows, 0, "portfolio caches are invalidated after the decision");
  assert.equal(result.ignored.status, "ignored");
  assert.equal(result.ignoredQuantity, 4, "an ignored split changes nothing");
});
