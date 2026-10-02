import assert from "node:assert/strict";
import test from "node:test";
import { isNewsPrefetchWindow } from "../../schedulers/news-scheduler.service.js";
import { runBackendScript } from "../helpers/backend-script.js";

test("news are prefetched only during the day, in the application timezone", () => {
  assert.equal(isNewsPrefetchWindow(new Date("2026-07-20T05:30:00.000Z"), "Europe/Paris"), true, "07:30 in Paris");
  assert.equal(isNewsPrefetchWindow(new Date("2026-07-20T04:30:00.000Z"), "Europe/Paris"), false, "06:30 in Paris");
  assert.equal(isNewsPrefetchWindow(new Date("2026-07-20T20:30:00.000Z"), "Europe/Paris"), false, "22:30 in Paris");
});

test("the prefetch refreshes held stocks once in their holders' languages, then global news, and skips fresh feeds", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { yahooClient } = await import("./services/yahoo/yahoo.client.ts");
    const { prefetchUsersNews } = await import("./services/news/news-prefetch.service.ts");
    const searches = [];
    yahooClient.search = async (query, options) => {
      searches.push(query + "|" + options.lang);
      return { news: [{ title: query + " article", link: "https://example.test/" + encodeURIComponent(query + options.lang), providerPublishTime: 1784800000 }], quotes: [] };
    };

    db.prepare("INSERT INTO users (username, password_hash, news_language_fr_enabled, news_language_en_enabled) VALUES ('alice', 'hash', 1, 0), ('bob', 'hash', 0, 1), ('carol', 'hash', 1, 1)").run();
    db.prepare("UPDATE users SET asset_news_enabled = 0 WHERE username = 'carol'").run();
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency, quote_type) VALUES ('AI.PA', 'Air Liquide', 'PAR', 'EUR', 'EQUITY'), ('CW8.PA', 'Amundi MSCI World', 'PAR', 'EUR', 'ETF'), ('MC.PA', 'LVMH', 'PAR', 'EUR', 'EQUITY')").run();
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, 'AI.PA', 'Air Liquide', 1, 100, 'EUR'), (1, 'CW8.PA', 'Amundi MSCI World', 1, 100, 'EUR'), (2, 'AI.PA', 'Air Liquide', 1, 100, 'EUR'), (3, 'MC.PA', 'LVMH', 1, 100, 'EUR')").run();

    const first = await prefetchUsersNews(5400);
    const firstSearches = [...searches].sort();
    const second = await prefetchUsersNews(5400);
    const aborted = new AbortController();
    aborted.abort();
    const cancelled = await prefetchUsersNews(0, aborted.signal);
    console.log("__RESULT__" + JSON.stringify({ first, firstSearches, second, totalSearches: searches.length, cancelled }));
  `) as {
    first: { users: number; companies: number; refreshedFeeds: number; failedFeeds: number };
    firstSearches: string[];
    second: { refreshedFeeds: number };
    totalSearches: number;
    cancelled: { refreshedFeeds: number };
  };

  assert.deepEqual(result.first, { users: 2, companies: 1, refreshedFeeds: 4, failedFeeds: 0 }, "Air Liquide in fr and en, then the global feed in both languages");
  assert.deepEqual(result.firstSearches, [
    "Air Liquide|en-US",
    "Air Liquide|fr-FR",
    "bourse|fr-FR",
    "economy|en-US",
    "finance|en-US",
    "finance|fr-FR",
    "marches financiers|fr-FR",
    "stock market|en-US"
  ], "the ETF and the stock of a user with news disabled are not prefetched");
  assert.equal(result.second.refreshedFeeds, 0, "feeds fresher than the prefetch interval are kept");
  assert.equal(result.totalSearches, result.firstSearches.length);
  assert.equal(result.cancelled.refreshedFeeds, 0, "a cancelled prefetch stops before any call");
});
