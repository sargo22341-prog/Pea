import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript as runIsolatedBackendScript, seedUser } from "./helpers/backend-script.js";

function runBackendScript(script: string) {
  return runIsolatedBackendScript(script, { tempPrefix: "pea-post-close-snapshot-" });
}

test("post-close snapshot state is reused and not overwritten by a later quote read", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { yahooApi } from "./services/yahoo/yahoo.api.ts";
    import { trackedMarketRepository } from "./repositories/market/tracked-market.repository.ts";
    import { marketCloseTask } from "./jobs/market/market-close.task.ts";
    import { marketSnapshotService } from "./services/market/snapshots/market-snapshot.service.ts";
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    let batchCalls = 0;
    let singleQuoteCalls = 0;
    yahooApi.quoteBatchRaw = async (symbols) => {
      batchCalls += 1;
      return symbols.map((symbol) => quoteRow(symbol, "CLOSED"));
    };
    yahooApi.quote = async (symbol) => {
      singleQuoteCalls += 1;
      return quoteRow(symbol, "PREPRE");
    };
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });
    const group = trackedMarketRepository.syncFromTrackedAssets().get("euronextParis");
    await marketCloseTask.run(group, new Date("2026-05-06T15:50:00.000Z"));
    const afterClose = db.prepare("SELECT s.market_state FROM asset_market_snapshots s JOIN assets a ON a.id = s.asset_id WHERE a.symbol = 'AAA.PA'").get();
    const quote = await marketSnapshotService.getQuote("AAA.PA");
    const afterRead = db.prepare("SELECT s.market_state FROM asset_market_snapshots s JOIN assets a ON a.id = s.asset_id WHERE a.symbol = 'AAA.PA'").get();
    console.log("__RESULT__" + JSON.stringify({ batchCalls, singleQuoteCalls, quote, afterClose, afterRead }));
  `);

  assert.equal(result.batchCalls, 1);
  assert.equal(result.singleQuoteCalls, 0);
  assert.equal(result.afterClose.market_state, "CLOSED");
  assert.equal(result.afterRead.market_state, "CLOSED");
  assert.equal(result.quote.marketState, "CLOSED");
});

test("post-close snapshot price wins over stale fundamentals and later quote reads", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "false";
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { yahooService } = await import("./services/yahoo/index.ts");
    const { trackedMarketRepository } = await import("./repositories/market/tracked-market.repository.ts");
    const { marketCloseTask } = await import("./jobs/market/market-close.task.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    ${helpers}

    yahooService.marketInfo = async () => ({ data: { marketState: "POSTPOST", regularMarketPrice: 1187, currency: "EUR" } });
    yahooService.extraData = async () => ({
      data: {
        analystConsensus: {
          currentPrice: 1187,
          targetHighPrice: 1400,
          targetLowPrice: 900,
          targetMeanPrice: 1200,
          targetMedianPrice: 1210,
          recommendationMean: 2,
          recommendationKey: "buy",
          numberOfAnalystOpinions: 12
        }
      }
    });
    yahooService.news = async () => ({ data: [] });
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });

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

        addTracked("AAA.PA", "AAA", "Paris");
        const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
        db.prepare("INSERT INTO asset_quote_snapshot (asset_id, market_state, last_price, currency, exchange, source, updated_at) VALUES (?, 'POSTPOST', 1187, 'EUR', 'Paris', 'seed', CURRENT_TIMESTAMP)").run(asset.id);

        let batchCalls = 0;
        let singleQuoteCalls = 0;
        yahooApi.quoteBatchRaw = async (symbols) => {
          batchCalls += 1;
          return symbols.map((symbol) => pricedQuoteRow(symbol, "POSTPOST", 1305));
        };
        yahooApi.quote = async (symbol) => {
          singleQuoteCalls += 1;
          return pricedQuoteRow(symbol, "POSTPOST", 1187);
        };

        const group = trackedMarketRepository.syncFromTrackedAssets().get("euronextParis");
        await marketCloseTask.run(group, new Date("2026-05-06T15:50:00.000Z"));
        await new Promise((resolve) => setTimeout(resolve, 50));

        const dbSnapshot = db.prepare("SELECT market_state, last_price, day_change, day_change_percent, previous_close, open_price, day_high, day_low, volume, bid_price, ask_price, regular_market_time, average_volume_3m, average_volume_10d, fifty_two_week_low, fifty_two_week_high, fifty_two_week_change_percent, ex_dividend_date FROM asset_market_snapshots WHERE asset_id = ?").get(asset.id);
        const quote = await marketSnapshotService.getQuote("AAA.PA");
        const response = await fetch(\`\${baseUrl}/api/assets/AAA.PA?range=1d\`, { headers: { Cookie: cookie } });
        const body = await response.json();
        const afterRoute = db.prepare("SELECT market_state, last_price, day_change, day_change_percent, previous_close, open_price, day_high, day_low, volume, bid_price, ask_price, regular_market_time, average_volume_3m, average_volume_10d, fifty_two_week_low, fifty_two_week_high, fifty_two_week_change_percent, ex_dividend_date FROM asset_market_snapshots WHERE asset_id = ?").get(asset.id);

        console.log("__RESULT__" + JSON.stringify({
          batchCalls,
          singleQuoteCalls,
          status: response.status,
          dbSnapshot,
          quote,
          routeQuotePrice: body.quote?.price,
          routeMarketInfoPrice: body.marketInfo?.regularMarketPrice,
          routeMarketState: body.marketInfo?.marketState,
          routeMarketInfo: body.marketInfo,
          analystCurrentPrice: body.analystConsensus?.currentPrice,
          afterRoute
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 200);
  assert.equal(result.batchCalls, 1);
  assert.equal(result.singleQuoteCalls, 0);
  assert.equal(result.dbSnapshot.market_state, "POSTPOST");
  assert.equal(result.dbSnapshot.last_price, 1305);
  assert.equal(result.dbSnapshot.day_change, 118);
  assert.equal(result.dbSnapshot.day_change_percent, 9.94);
  assert.equal(result.dbSnapshot.previous_close, 1000);
  assert.equal(result.dbSnapshot.open_price, 1190);
  assert.equal(result.dbSnapshot.day_high, 1310);
  assert.equal(result.dbSnapshot.day_low, 1175);
  assert.equal(result.dbSnapshot.volume, 1234567);
  assert.equal(result.dbSnapshot.bid_price, 1304.5);
  assert.equal(result.dbSnapshot.ask_price, 1305.5);
  assert.equal(result.dbSnapshot.regular_market_time, "2026-05-06T15:45:00.000Z");
  assert.equal(result.dbSnapshot.average_volume_3m, 7654321);
  assert.equal(result.dbSnapshot.average_volume_10d, 2345678);
  assert.equal(result.dbSnapshot.fifty_two_week_low, 49.24);
  assert.equal(result.dbSnapshot.fifty_two_week_high, 81.34);
  assert.equal(result.dbSnapshot.fifty_two_week_change_percent, 42.83023);
  assert.equal(result.dbSnapshot.ex_dividend_date, "2026-06-30T00:00:00.000Z");
  assert.equal(result.quote.price, 1305);
  assert.equal(result.routeQuotePrice, 1305);
  assert.equal(result.routeMarketInfoPrice, 1305);
  assert.equal(result.routeMarketState, "POST");
  assert.equal(result.routeMarketInfo.regularMarketChange, 118);
  assert.equal(result.routeMarketInfo.regularMarketChangePercent, 9.94);
  assert.equal(result.routeMarketInfo.regularMarketPreviousClose, 1000);
  assert.equal(result.routeMarketInfo.regularMarketOpen, 1190);
  assert.equal(result.routeMarketInfo.regularMarketDayHigh, 1310);
  assert.equal(result.routeMarketInfo.regularMarketDayLow, 1175);
  assert.equal(result.routeMarketInfo.regularMarketVolume, 1234567);
  assert.equal(result.routeMarketInfo.bid, 1304.5);
  assert.equal(result.routeMarketInfo.ask, 1305.5);
  assert.equal(result.routeMarketInfo.regularMarketTime, "2026-05-06T15:45:00.000Z");
  assert.equal(result.routeMarketInfo.averageDailyVolume3Month, 7654321);
  assert.equal(result.routeMarketInfo.fiftyTwoWeekLow, 49.24);
  assert.equal(result.routeMarketInfo.fiftyTwoWeekHigh, 81.34);
  assert.equal(result.routeMarketInfo.exDividendDate, "2026-06-30T00:00:00.000Z");
  assert.equal(result.analystCurrentPrice, 1305);
  assert.equal(result.afterRoute.last_price, 1305);
});
