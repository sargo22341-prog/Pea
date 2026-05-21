import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript as runIsolatedBackendScript } from "./helpers/backend-script.js";

function runBackendScript(script: string) {
  return runIsolatedBackendScript(script, { tempPrefix: "pea-live-fundamentals-cache-" });
}

test("live analysis uses cached ETF sector weightings instead of ETF diversified fallback", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { writeCache } = await import("./services/yahoo/cache/yahoo.cache.ts");
    const { portfolioAnalysisService } = await import("./services/portfolio/portfolio-analysis.service.ts");

    db.prepare("INSERT INTO users (username, password_hash) VALUES ('tester', 'hash')").run();
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency, quote_type) VALUES ('ETF.PA', 'ETF', 'Paris', 'EUR', 'ETF')").run();
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'ETF.PA'").get();
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, 'ETF.PA', 'ETF', 10, 100, 'EUR')").run();
    db.prepare(
      "INSERT INTO asset_quote_snapshot (asset_id, market_state, last_price, previous_close, currency, exchange, quote_type, source, last_checked_at, updated_at) VALUES (?, 'REGULAR', 100, 100, 'EUR', 'Paris', 'ETF', 'seed', ?, ?)"
    ).run(asset.id, new Date().toISOString(), new Date().toISOString());
    writeCache("cached_fundamentals", "ETF.PA", {
      quoteType: { quoteType: "ETF", typeDisp: "ETF" },
      fundProfile: { family: "Test issuer" },
      topHoldings: { sectorWeightings: [{ technology: 0.4, healthcare: 0.2, financial_services: 0.4 }] }
    });

    const analysis = await portfolioAnalysisService.analysis(1);
    console.log("__RESULT__" + JSON.stringify(analysis.sectorAllocation));
  `);

  assert.deepEqual(result.map((item: any) => ({ name: item.name, value: item.value })), [
    { name: "Technologie", value: 40 },
    { name: "Services financiers", value: 40 },
    { name: "Sante", value: 20 }
  ]);
});

test("live asset details exposes cached ETF fund details without Yahoo extraData", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { writeCache } = await import("./services/yahoo/cache/yahoo.cache.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { assetDetailsAssembler } = await import("./services/assets/asset-details-assembler.service.ts");
    const { yahooService } = await import("./services/yahoo/index.ts");

    let extraDataCalls = 0;
    yahooService.extraData = async () => { extraDataCalls += 1; return { data: {} }; };

    db.prepare("INSERT INTO users (username, password_hash, asset_news_enabled) VALUES ('tester', 'hash', 0)").run();
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency, quote_type) VALUES ('ETF.PA', 'ETF', 'Paris', 'EUR', 'ETF')").run();
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'ETF.PA'").get();
    db.prepare(
      "INSERT INTO asset_quote_snapshot (asset_id, market_state, last_price, previous_close, currency, exchange, quote_type, source, last_checked_at, updated_at) VALUES (?, 'REGULAR', 100, 100, 'EUR', 'Paris', 'ETF', 'seed', ?, ?)"
    ).run(asset.id, new Date().toISOString(), new Date().toISOString());
    writeCache("cached_fundamentals", "ETF.PA", {
      quoteType: { quoteType: "ETF", typeDisp: "ETF" },
      fundProfile: {
        family: "Test issuer",
        feesExpensesInvestment: {
          annualReportExpenseRatio: { raw: 0.0012 },
          totalNetAssets: { raw: 1234 }
        }
      },
      topHoldings: { sectorWeightings: [{ technology: 0.4, healthcare: 0.2 }] }
    });

    const details = await runWithUser(1, () => assetDetailsAssembler.assemble({
      symbol: "ETF.PA",
      range: "1d",
      user: {
        id: 1,
        username: "tester",
        role: "user",
        assetNewsEnabled: false,
        newsLanguageFrEnabled: true,
        newsLanguageEnEnabled: false
      },
      newsLanguages: []
    }));
    console.log("__RESULT__" + JSON.stringify({ extraDataCalls, isEtf: details.isEtf, fundDetails: details.fundDetails }));
  `);

  assert.equal(result.extraDataCalls, 0);
  assert.equal(result.isEtf, true);
  assert.deepEqual(result.fundDetails, {
    family: "Test issuer",
    annualReportExpenseRatio: 0.0012,
    totalNetAssets: 1234,
    sectorWeightings: [
      { key: "technology", value: 0.4 },
      { key: "healthcare", value: 0.2 }
    ]
  });
});

test("asset details schedules annex refresh when a known asset has only base snapshot data", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { dataConstructionQueue } = await import("./services/market/construction/data-construction-queue.service.ts");
    const { assetDetailsAssembler } = await import("./services/assets/asset-details-assembler.service.ts");

    const queuedSymbols = [];
    dataConstructionQueue.enqueueAnnexRefreshIfNotRecentlyQueued = (symbol) => {
      queuedSymbols.push(symbol);
      return dataConstructionQueue.latest();
    };

    db.prepare("INSERT INTO users (username, password_hash, asset_news_enabled) VALUES ('tester', 'hash', 0)").run();
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency, quote_type) VALUES ('URTH', 'iShares MSCI World ETF', 'PCX', 'USD', 'ETF')").run();
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'URTH'").get();
    db.prepare(
      "INSERT INTO asset_quote_snapshot (asset_id, market_state, last_price, previous_close, currency, exchange, quote_type, source, last_checked_at, updated_at) VALUES (?, 'REGULAR', 200, 199, 'USD', 'PCX', 'ETF', 'seed', ?, ?)"
    ).run(asset.id, new Date().toISOString(), new Date().toISOString());

    const details = await runWithUser(1, () => assetDetailsAssembler.assemble({
      symbol: "URTH",
      range: "1d",
      user: {
        id: 1,
        username: "tester",
        role: "user",
        assetNewsEnabled: false,
        newsLanguageFrEnabled: true,
        newsLanguageEnEnabled: false
      },
      newsLanguages: []
    }));
    console.log("__RESULT__" + JSON.stringify({ queuedSymbols, isEtf: details.isEtf, fundDetails: details.fundDetails ?? null }));
  `);

  assert.deepEqual(result.queuedSymbols, ["URTH"]);
  assert.equal(result.isEtf, true);
  assert.equal(result.fundDetails, null);
});
