import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

interface SummaryQuotesResult {
  prices: Record<string, number>;
  quoteOptions: { allowStaleWhileRefresh?: boolean }[];
  unexpectedError: string | null;
}

test("an unavailable quote only affects its own position and other errors still surface", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { HttpError } = await import("./utils/http-error.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    const { portfolioReadService } = await import("./services/portfolio/portfolio-read.service.ts");
    db.prepare("INSERT INTO users (username, password_hash) VALUES ('alice', 'hash')").run();
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, 'AI.PA', 'Air Liquide', 2, 100, 'EUR'), (1, 'MC.PA', 'LVMH', 1, 500, 'EUR')").run();

    const quoteOptions = [];
    let failure = new HttpError(503, "Yahoo Finance est temporairement indisponible.");
    marketSnapshotService.getQuote = async (symbol, options) => {
      quoteOptions.push(options);
      if (symbol === "MC.PA") throw failure;
      return { symbol, name: symbol, price: 150, currency: "EUR", marketState: "REGULAR" };
    };

    const summary = await portfolioReadService.summary("1d", 1);
    const prices = Object.fromEntries(summary.positions.map((position) => [position.symbol, position.currentPrice]));
    failure = new Error("bug");
    const unexpectedError = await portfolioReadService.summary("1d", 1).then(() => null, (error) => error.message);
    console.log("__RESULT__" + JSON.stringify({ prices, quoteOptions, unexpectedError }));
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as SummaryQuotesResult;

  assert.equal(result.prices["AI.PA"], 150, "the available quote is kept");
  assert.equal(result.prices["MC.PA"], 500, "the unavailable position falls back to its average price");
  assert.ok(result.quoteOptions.every((options) => options.allowStaleWhileRefresh === true), "the last known quote is served while refreshing");
  assert.equal(result.unexpectedError, "bug");
});

test("a live summary built from a stale quote is not kept in the block cache", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
    const { portfolioReadService } = await import("./services/portfolio/portfolio-read.service.ts");
    const { frontendBlockCache } = await import("./services/shared/frontend-block-cache.service.ts");
    db.prepare("INSERT INTO users (username, password_hash) VALUES ('alice', 'hash')").run();
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, 'AI.PA', 'Air Liquide', 2, 100, 'EUR')").run();

    let stale = true;
    marketSnapshotService.getQuote = async (symbol) => ({ symbol, name: symbol, price: 150, currency: "EUR", marketState: "REGULAR", stale });
    await portfolioReadService.summary("1d", 1);
    const cachedWhileStale = Boolean(frontendBlockCache.read("1", "portfolio-summary", "1d"));
    stale = false;
    await portfolioReadService.summary("1d", 1);
    const cachedWhenFresh = Boolean(frontendBlockCache.read("1", "portfolio-summary", "1d"));
    console.log("__RESULT__" + JSON.stringify({ cachedWhileStale, cachedWhenFresh }));
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "true" } }) as { cachedWhileStale: boolean; cachedWhenFresh: boolean };

  assert.equal(result.cachedWhileStale, false, "the refreshed quote must replace the stale one on the next read");
  assert.equal(result.cachedWhenFresh, true);
});
