import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";

interface ClosedSummaryResult {
  closed: { symbols: string[]; closedPositionsCount: number; assetsCount: number; totalValue: number; totalDividendsReceived: number };
  performanceSymbols: string[];
  quotedSymbols: string[];
  dividends: { past: { symbol: string; totalAmount: number }[]; upcomingSymbols: string[] };
  reopened: { symbols: string[]; closedPositionsCount: number; quantity: number | undefined };
  otherUserSymbols: string[];
}

test("a fully sold position leaves the summary without a quote and comes back with the next purchase", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
    const { dividendsRepository } = await import("./repositories/market/dividends.repository.ts");
    const { portfolioReadService } = await import("./services/portfolio/portfolio-read.service.ts");
    const { portfolioWriteService } = await import("./services/portfolio/portfolio-write.service.ts");
    const { positionPerformanceService } = await import("./services/portfolio/position-performance.service.ts");
    const { dividendService } = await import("./services/portfolio/dividends/dividend.service.ts");

    db.prepare("INSERT INTO users (username, password_hash) VALUES ('alice', 'hash'), ('bob', 'hash')").run();
    for (const symbol of ["AAA.PA", "WLD.PA"]) db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES (?, ?, 'Paris', 'EUR')").run(symbol, symbol);
    const addPosition = (userId, symbol) => {
      db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, ?, ?, 0, 0, 'EUR')").run(userId, symbol, symbol);
      return db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = ?").get(userId, symbol).id;
    };
    // Insertion directe puis recalcul réel de la position : le compte espèces n'est pas l'objet du test.
    const trade = (userId, positionId, type, quantity, tradedAt) => {
      db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source) VALUES (?, ?, ?, 100, 0, 'EUR', ?, 'manual')").run(positionId, type, quantity, tradedAt);
      portfolioWriteService.recomputePositionFromAnyTransactions(positionId, userId);
    };

    const aaa = addPosition(1, "AAA.PA");
    const world = addPosition(1, "WLD.PA");
    trade(1, aaa, "buy", 2, "2026-01-05T10:00:00.000Z");
    trade(1, world, "buy", 11, "2026-01-05T10:00:00.000Z");
    trade(1, world, "sell", 11, "2026-02-10T10:00:00.000Z");
    // Bob détient toujours le même ETF : la vente d'Alice ne le concerne pas.
    trade(2, addPosition(2, "WLD.PA"), "buy", 3, "2026-01-05T10:00:00.000Z");
    const worldAsset = db.prepare("SELECT id FROM assets WHERE symbol = 'WLD.PA'").get();
    dividendsRepository.upsert(worldAsset.id, { date: "2026-01-20T00:00:00.000Z", amount: 1, currency: "EUR" });

    const quotedSymbols = [];
    marketSnapshotService.getQuote = async (symbol) => {
      quotedSymbols.push(symbol);
      return { symbol, name: symbol, price: 120, currency: "EUR", marketState: "CLOSED" };
    };
    marketDataService.getChartData = async (symbol, range) => ({ symbol, range, interval: "1d", timestamps: [], prices: [], cachedAt: 0, expiresAt: 0 });

    const summary = await portfolioReadService.summary("1d", 1);
    const performance = await positionPerformanceService.positionsPerformance("1d", {}, 1);
    const dividends = await dividendService.portfolioDividends(1, new Date("2026-03-01T00:00:00.000Z"));
    const quotedBeforeReopen = [...quotedSymbols];

    trade(1, world, "buy", 1, "2026-03-02T10:00:00.000Z");
    const reopened = await portfolioReadService.summary("1d", 1);
    const otherUser = await portfolioReadService.summary("1d", 2);

    console.log("__RESULT__" + JSON.stringify({
      closed: {
        symbols: summary.positions.map((position) => position.symbol),
        closedPositionsCount: summary.closedPositionsCount,
        assetsCount: summary.assetsCount,
        totalValue: summary.totalValue,
        totalDividendsReceived: summary.totalDividendsReceived
      },
      performanceSymbols: performance.map((position) => position.symbol),
      quotedSymbols: [...new Set(quotedBeforeReopen)],
      dividends: {
        past: dividends.past.map((event) => ({ symbol: event.symbol, totalAmount: event.totalAmount })),
        upcomingSymbols: [...new Set(dividends.upcoming.map((event) => event.symbol))]
      },
      reopened: {
        symbols: reopened.positions.map((position) => position.symbol),
        closedPositionsCount: reopened.closedPositionsCount,
        quantity: reopened.positions.find((position) => position.symbol === "WLD.PA")?.quantity
      },
      otherUserSymbols: otherUser.positions.map((position) => position.symbol)
    }));
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as ClosedSummaryResult;

  assert.deepEqual(result.closed.symbols, ["AAA.PA"], "the sold ETF is hidden from the positions");
  assert.equal(result.closed.closedPositionsCount, 1);
  assert.equal(result.closed.assetsCount, 1);
  assert.equal(result.closed.totalValue, 240);
  assert.equal(result.closed.totalDividendsReceived, 11, "dividends received while the ETF was held are still counted");
  assert.deepEqual(result.performanceSymbols, ["AAA.PA"]);
  assert.deepEqual(result.quotedSymbols, ["AAA.PA"], "no quote is requested for a sold position");
  assert.deepEqual(result.dividends.past, [{ symbol: "WLD.PA", totalAmount: 11 }], "past dividends of the sold ETF stay in the dividend history");
  assert.ok(!result.dividends.upcomingSymbols.includes("WLD.PA"), "a sold position has no upcoming dividend");
  assert.deepEqual(result.reopened.symbols, ["AAA.PA", "WLD.PA"], "a new purchase shows the position again");
  assert.equal(result.reopened.closedPositionsCount, 0);
  assert.equal(result.reopened.quantity, 1);
  assert.deepEqual(result.otherUserSymbols, ["WLD.PA"], "another user's holding of the same asset is unaffected");
});

test("portfolio caches written before closed positions were hidden are purged by the migration", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { purgeClosedPositionCachesMigration } = await import("./migrations/cache/059-purge-closed-position-caches.ts");
    const later = Date.now() + 72 * 3600 * 1000;
    db.prepare("INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at) VALUES ('1:portfolio-summary:1d', '1', 'portfolio-summary', '1d', '{}', ?, ?)").run(Date.now(), later);
    db.prepare("INSERT INTO portfolio_chart_cache (cache_key, user_id, range, payload, cached_at, expires_at) VALUES ('1:1d', '1', '1d', '{}', ?, ?)").run(Date.now(), later);
    db.prepare("INSERT INTO portfolio_positions_performance_cache (cache_key, user_id, range, portfolio_version, market_data_version, payload, cached_at, expires_at) VALUES ('1:1d', '1', '1d', 'v', 'v', '[]', ?, ?)").run(Date.now(), later);
    purgeClosedPositionCachesMigration.appliquer(db);
    const count = (table) => db.prepare("SELECT COUNT(*) AS total FROM " + table).get().total;
    console.log("__RESULT__" + JSON.stringify([count("frontend_block_cache"), count("portfolio_chart_cache"), count("portfolio_positions_performance_cache")]));
  `) as number[];

  assert.deepEqual(result, [0, 0, 0], "cached summaries, curves and position performances no longer list sold positions");
});
