import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript, seedUser } from "../helpers/backend-script.js";

test("list queries reuse one prepared statement whatever the list length", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { buildTransactionCache } = await import("./services/portfolio/portfolio-calculations.ts");
    const { liveRefreshRepository } = await import("./repositories/market/live-refresh.repository.ts");
    ${seedUser}
    for (const symbol of ["AAA.PA", "BBB.PA", "CCC.PA"]) {
      db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, ?, ?, 1, 10, 'EUR')").run(symbol, symbol);
    }
    const ids = db.prepare("SELECT id FROM positions ORDER BY id").all().map((row) => row.id);
    buildTransactionCache(ids.slice(0, 1));
    liveRefreshRepository.userImpactsForSymbols(["aaa.pa"]);
    const afterFirstCalls = db.cachedStatementCount();
    buildTransactionCache(ids.slice(0, 2));
    buildTransactionCache(ids);
    const impacts = liveRefreshRepository.userImpactsForSymbols(["aaa.pa", "BBB.PA", "zzz.pa"]);
    console.log("__RESULT__" + JSON.stringify({ afterFirstCalls, afterAllCalls: db.cachedStatementCount(), cached: buildTransactionCache(ids).size, impacts: [...impacts] }));
  `) as { afterFirstCalls: number; afterAllCalls: number; cached: number; impacts: [string, { portfolio: boolean; watchlist: boolean }][] };

  assert.equal(result.afterAllCalls, result.afterFirstCalls);
  assert.equal(result.cached, 3);
  assert.deepEqual(result.impacts, [["1", { portfolio: true, watchlist: false }]]);
});
