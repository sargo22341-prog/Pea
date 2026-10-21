import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";

interface ScopeResult {
  tracked: string[];
  trackedAssets: string[];
  withHistory: string[];
  liveUsers: string[];
  livePortfolioSymbols: string[];
  aliceHeld: string[];
  calendar: string[];
  news: string[];
}

/**
 * Alice détient HELD.PA, a soldé OLD.PA il y a longtemps (enregistrement ancien) et RECENT.PA
 * dans le délai de grâce. Bob détient SHARED.PA, qu'Alice a soldé il y a longtemps.
 */
const scenario = `
  const { db } = await import("./db.ts");
  db.prepare("INSERT INTO users (username, password_hash) VALUES ('alice', 'hash'), ('bob', 'hash')").run();
  const addPosition = (userId, symbol, quantity, updatedAt) => {
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES (?, ?, 'Paris', 'EUR') ON CONFLICT(symbol) DO NOTHING").run(symbol, symbol);
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency, updated_at) VALUES (?, ?, ?, ?, 10, 'EUR', ?)").run(userId, symbol, symbol, quantity, updatedAt);
    return db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = ?").get(userId, symbol).id;
  };
  const addTrade = (positionId, type, quantity, tradedAt) =>
    db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at) VALUES (?, ?, ?, 10, 0, 'EUR', ?)").run(positionId, type, quantity, tradedAt);
  const longAgo = "2020-01-01 00:00:00";
  const recently = db.prepare("SELECT datetime('now', '-2 days') AS value").get().value;
  const held = addPosition(1, "HELD.PA", 2, longAgo);
  addTrade(held, "buy", 2, "2020-01-01T10:00:00.000Z");
  const old = addPosition(1, "OLD.PA", 0, longAgo);
  addTrade(old, "buy", 11, "2020-01-01T10:00:00.000Z");
  addTrade(old, "sell", 11, "2020-02-01T10:00:00.000Z");
  const recent = addPosition(1, "RECENT.PA", 0, recently);
  addTrade(recent, "buy", 4, "2020-01-01T10:00:00.000Z");
  addTrade(recent, "sell", 4, new Date(Date.now() - 2 * 86400000).toISOString());
  addPosition(1, "SHARED.PA", 0, longAgo);
  addPosition(2, "SHARED.PA", 3, longAgo);
`;

test("scheduled Yahoo refreshes and portfolio scopes skip positions sold long ago", () => {
  const result = runBackendScript(`
    ${scenario}
    const { assetRepository } = await import("./repositories/market/asset.repository.ts");
    const { liveRefreshRepository } = await import("./repositories/market/live-refresh.repository.ts");
    const { portfolioRepository } = await import("./repositories/portfolio/portfolio.repository.ts");
    const { readCalendarEventsForPortfolio } = await import("./repositories/calendar-events/calendar-events.repository.ts");
    const { listAssetNewsPositions } = await import("./services/news/asset-news-candidates.ts");
    for (const symbol of ["HELD.PA", "OLD.PA"]) {
      db.prepare("INSERT INTO asset_calendar_events (symbol, event_type, event_date) VALUES (?, 'earnings', '2030-01-01T00:00:00.000Z')").run(symbol);
    }
    const impacts = liveRefreshRepository.userImpactsForSymbols(["OLD.PA", "SHARED.PA"]);
    console.log("__RESULT__" + JSON.stringify({
      tracked: assetRepository.listTrackedSymbols(),
      trackedAssets: assetRepository.listTrackedAssets().map((asset) => asset.symbol),
      withHistory: assetRepository.listSymbolsWithHistory(),
      liveUsers: [...impacts.keys()],
      livePortfolioSymbols: liveRefreshRepository.portfolioSymbolsForSymbols(["OLD.PA", "RECENT.PA", "HELD.PA"]).sort(),
      aliceHeld: portfolioRepository.heldPositionSymbols(1),
      calendar: readCalendarEventsForPortfolio(1).map((row) => row.symbol),
      news: listAssetNewsPositions(1).map((row) => row.symbol)
    }));
  `) as ScopeResult;

  assert.deepEqual(result.tracked, ["HELD.PA", "RECENT.PA", "SHARED.PA"], "OLD.PA is no longer refreshed; RECENT.PA stays within the grace period; Bob keeps SHARED.PA");
  assert.deepEqual(result.trackedAssets, ["HELD.PA", "RECENT.PA", "SHARED.PA"]);
  assert.deepEqual(result.withHistory, ["HELD.PA", "OLD.PA", "RECENT.PA", "SHARED.PA"], "a market data rebuild keeps the history of sold positions");
  assert.deepEqual(result.liveUsers, ["2"], "only Bob still holds one of the updated symbols");
  assert.deepEqual(result.livePortfolioSymbols, ["HELD.PA", "RECENT.PA"]);
  assert.deepEqual(result.aliceHeld, ["HELD.PA"]);
  assert.deepEqual(result.calendar, ["HELD.PA"]);
  assert.deepEqual(result.news, ["HELD.PA"]);
});

test("the portfolio curve only loads prices of sold positions held during the range", () => {
  const result = runBackendScript(`
    ${scenario}
    const { marketDataService } = await import("./services/market/data/market-data.service.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    const { portfolioPerformanceService } = await import("./services/portfolio/portfolio-performance.service.ts");
    const charts = {};
    const quoted = new Set();
    marketDataService.getChartData = async (symbol, range) => {
      (charts[range] ??= []).push(symbol);
      return { symbol, range, interval: "1d", timestamps: [], prices: [], cachedAt: 0, expiresAt: 0 };
    };
    marketSnapshotService.getQuote = async (symbol) => {
      quoted.add(symbol);
      return { symbol, name: symbol, price: 12, currency: "EUR", marketState: "CLOSED" };
    };
    for (const range of ["1m", "all"]) await portfolioPerformanceService.performance(range, {}, 1);
    console.log("__RESULT__" + JSON.stringify({ charts: { "1m": charts["1m"].sort(), all: charts.all.sort() }, quoted: [...quoted].sort() }));
  `) as { charts: { "1m": string[]; all: string[] }; quoted: string[] };

  assert.deepEqual(result.charts["1m"], ["HELD.PA", "RECENT.PA"], "a position sold before the range is skipped");
  assert.deepEqual(result.charts.all, ["HELD.PA", "OLD.PA", "RECENT.PA", "SHARED.PA"], "the full history still includes every sold position");
  assert.deepEqual(result.quoted, ["HELD.PA"], "sold positions never need a current quote");
});
