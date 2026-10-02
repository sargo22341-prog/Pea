import assert from "node:assert/strict";
import test from "node:test";
import type { NewsAssetsPage } from "@pea/shared";
import { runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface NewsHttpResult {
  anonymousStatuses: number[];
  first: NewsAssetsPage;
  second: NewsAssetsPage;
  searchesAfterFirst: number;
  searchesAfterSecond: number;
  bob: NewsAssetsPage;
  disabled: NewsAssetsPage;
  disabledGlobal: { total: number };
  clamped: NewsAssetsPage;
  invalidStatus: number;
}

test("asset news are private, skip funds, validate their query and reuse the aggregated cache", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooClient } = await import("./services/yahoo/yahoo.client.ts");
    ${sessionUserHelpers}
    let searches = 0;
    yahooClient.search = async (query, options) => {
      searches += 1;
      return { news: [
        { title: "Air Liquide signe un contrat", link: "https://example.test/" + options.lang + "/contrat", providerPublishTime: 1784800000 },
        { title: "Le marche du jour", link: "https://example.test/" + options.lang + "/marche", providerPublishTime: 1784800000 }
      ], quotes: [] };
    };

    const alice = createUserWithSession("alice");
    const bob = createUserWithSession("bob");
    const carol = createUserWithSession("carol");
    db.prepare("UPDATE users SET asset_news_enabled = 0 WHERE id = ?").run(carol.id);
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency, quote_type) VALUES ('AI.PA', 'Air Liquide SA', 'PAR', 'EUR', 'EQUITY'), ('CW8.PA', 'Amundi MSCI World', 'PAR', 'EUR', 'ETF')").run();
    for (const user of [alice, carol]) {
      db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'AI.PA', 'Air Liquide', 10, 150, 'EUR'), (?, 'CW8.PA', 'Amundi MSCI World', 5, 400, 'EUR')").run(user.id, user.id);
    }

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      const get = (path, cookie) => fetch(baseUrl + path, cookie ? { headers: { Cookie: cookie } } : {});
      try {
        const anonymousStatuses = await Promise.all(["/api/news-assets", "/api/news-global", "/api/news/AI.PA"].map(async (path) => (await get(path)).status));
        const first = await (await get("/api/news-assets", alice.cookie)).json();
        const searchesAfterFirst = searches;
        const second = await (await get("/api/news-assets", alice.cookie)).json();
        const searchesAfterSecond = searches;
        const bobPage = await (await get("/api/news-assets", bob.cookie)).json();
        const disabled = await (await get("/api/news-assets", carol.cookie)).json();
        const disabledGlobal = await (await get("/api/news-global", carol.cookie)).json();
        const clamped = await (await get("/api/news-assets?limit=50", alice.cookie)).json();
        const invalidStatus = (await get("/api/news-assets?limit=abc", alice.cookie)).status;
        console.log("__RESULT__" + JSON.stringify({
          anonymousStatuses, first, second, searchesAfterFirst, searchesAfterSecond,
          bob: bobPage, disabled, disabledGlobal, clamped, invalidStatus
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as NewsHttpResult;

  assert.deepEqual(result.anonymousStatuses, [401, 401, 401]);

  assert.equal(result.first.totalAssets, 1, "the ETF is not queried for company news");
  assert.equal(result.first.hasMore, false);
  assert.deepEqual(result.first.articles.map((article) => article.title), ["Air Liquide signe un contrat"]);
  assert.deepEqual(result.first.articles[0]?.relatedAssets, [{ symbol: "AI.PA", name: "Air Liquide" }]);
  assert.equal(result.searchesAfterFirst, 1, "one search for the only stock in the user's language");

  assert.deepEqual(result.second, result.first, "the aggregated page is served again");
  assert.equal(result.searchesAfterSecond, result.searchesAfterFirst, "the aggregated cache avoids any Yahoo call");

  assert.deepEqual(result.bob, { articles: [], limit: 8, offset: 0, totalAssets: 0, queriedAssets: 0, hasMore: false }, "another user never sees alice's news");
  assert.equal(result.disabled.articles.length, 0, "news disabled in the preferences stay empty");
  assert.equal(result.disabledGlobal.total, 0);
  assert.equal(result.clamped.limit, 8, "the batch size is capped");
  assert.equal(result.invalidStatus, 400);
});

test("an aggregated page built from unavailable feeds is not cached", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { yahooClient } = await import("./services/yahoo/yahoo.client.ts");
    const { readAssetNewsPage } = await import("./services/news/asset-news-feed.service.ts");
    ${sessionUserHelpers}
    let searches = 0;
    yahooClient.search = async () => { searches += 1; throw new Error("Yahoo down"); };
    const alice = createUserWithSession("alice");
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'AI.PA', 'Air Liquide', 10, 150, 'EUR')").run(alice.id);

    const first = await readAssetNewsPage(alice.id, ["fr"], 8, 0);
    const second = await readAssetNewsPage(alice.id, ["fr"], 8, 0);
    const aggregates = db.prepare("SELECT COUNT(*) AS count FROM cache_entries WHERE key LIKE 'news:assets:%'").get().count;
    console.log("__RESULT__" + JSON.stringify({ first, second, searches, aggregates }));
  `) as { first: NewsAssetsPage; second: NewsAssetsPage; searches: number; aggregates: number };

  assert.equal(result.first.articles.length, 0);
  assert.equal(result.first.totalAssets, 1);
  assert.equal(result.aggregates, 0);
  assert.equal(result.searches, 2, "the next request tries Yahoo again instead of serving a cached empty page");
});
