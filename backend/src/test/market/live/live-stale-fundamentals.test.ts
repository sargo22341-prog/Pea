import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";

test("live asset details serve stale fundamentals and refresh them in background", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { yahooService } = await import("./services/yahoo/index.ts");
    const { dataConstructionQueue } = await import("./services/market/construction/data-construction-queue.service.ts");
    const { assetDetailsAssembler } = await import("./services/assets/asset-details-assembler.service.ts");

    const queuedSymbols = [];
    dataConstructionQueue.enqueueAnnexRefreshIfNotRecentlyQueued = (symbol) => {
      queuedSymbols.push(symbol);
      return dataConstructionQueue.latest();
    };
    let extraDataCalls = 0;
    yahooService.extraData = async () => { extraDataCalls += 1; return { data: {} }; };

    db.prepare("INSERT INTO users (username, password_hash, asset_news_enabled) VALUES ('tester', 'hash', 0)").run();
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency, quote_type) VALUES ('MC.PA', 'LVMH', 'PAR', 'EUR', 'EQUITY')").run();
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'MC.PA'").get();
    db.prepare(
      "INSERT INTO asset_quote_snapshot (asset_id, market_state, last_price, previous_close, currency, exchange, quote_type, source, last_checked_at, updated_at) VALUES (?, 'CLOSED', 400, 399, 'EUR', 'PAR', 'EQUITY', 'seed', ?, ?)"
    ).run(asset.id, new Date().toISOString(), new Date().toISOString());
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, 'MC.PA', 'LVMH', 1, 400, 'EUR')").run();
    const eightDaysAgo = Math.floor(Date.now() / 1000) - 8 * 24 * 3600;
    db.prepare("INSERT INTO cache_entries (scope, key, payload, fetched_at) VALUES ('fundamentals', 'MC.PA', ?, ?)").run(
      JSON.stringify({ summaryDetail: { trailingPE: 18, priceToSalesTrailing12Months: 2.4 }, price: { currency: "EUR" } }),
      eightDaysAgo
    );

    const details = await runWithUser(1, () => assetDetailsAssembler.assemble({
      symbol: "MC.PA",
      range: "1d",
      user: { id: 1, username: "tester", role: "user", assetNewsEnabled: false },
      newsLanguages: []
    }));
    console.log("__RESULT__" + JSON.stringify({ queuedSymbols, extraDataCalls, trailingPE: details.valuation?.trailingPE ?? null }));
  `) as { queuedSymbols: string[]; extraDataCalls: number; trailingPE: number | null };

  assert.equal(result.trailingPE, 18, "the stale cache is still displayed");
  assert.equal(result.extraDataCalls, 0, "no synchronous Yahoo call in live mode");
  assert.deepEqual(result.queuedSymbols, ["MC.PA"]);
});
