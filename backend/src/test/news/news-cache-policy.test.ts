import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

/** Fragment commun : flux en cache vieillis à la main et recherche Yahoo simulée. */
const newsScriptSetup = `
const { db } = await import("./db.ts");
const { yahooClient } = await import("./services/yahoo/yahoo.client.ts");
const { writeNewsCache } = await import("./services/yahoo/cache/news.cache.ts");
const { fetchNews, fetchCompanyNews } = await import("./services/yahoo/news/news.job.ts");
const hours = (count) => count * 3600;
function article(title, ticker) {
  return { title, description: "", url: "https://example.test/" + encodeURIComponent(title), publishedAt: "2026-07-20T10:00:00.000Z", relatedTickers: [ticker] };
}
function ageCache(key, seconds) {
  db.prepare("UPDATE cache_entries SET fetched_at = fetched_at - ? WHERE scope = 'news' AND key = ?").run(seconds, key.toUpperCase());
}
function cacheRow(key) {
  return db.prepare("SELECT payload, fetched_at, expires_at FROM cache_entries WHERE scope = 'news' AND key = ?").get(key.toUpperCase());
}
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 200 && !predicate(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
}
`;

test("an expired news feed is served at once and refreshed in the background", () => {
  const result = runBackendScript(`
    ${newsScriptSetup}
    const key = "news:ticker:AI.PA:fr";
    writeNewsCache(key, [article("Ancien article", "AI.PA")]);
    ageCache(key, hours(7));

    let releaseYahoo;
    const yahooGate = new Promise((resolve) => { releaseYahoo = resolve; });
    let searchCalls = 0;
    let yahooAnswered = false;
    yahooClient.search = async () => {
      searchCalls += 1;
      await yahooGate;
      yahooAnswered = true;
      return { news: [{ title: "Nouvel article", link: "https://example.test/nouveau", providerPublishTime: 1784800000, relatedTickers: ["AI.PA"] }], quotes: [] };
    };

    const served = await fetchNews("AI.PA", ["fr"]);
    const servedBeforeYahooAnswered = !yahooAnswered;
    await waitFor(() => searchCalls === 1);
    releaseYahoo();
    await waitFor(() => JSON.parse(cacheRow(key).payload)[0]?.title === "Nouvel article");
    const refreshed = await fetchNews("AI.PA", ["fr"]);
    const row = cacheRow(key);
    console.log("__RESULT__" + JSON.stringify({
      served, servedBeforeYahooAnswered, refreshed, searchCalls,
      expiresInSeconds: Math.round(row.expires_at / 1000 - row.fetched_at)
    }));
  `) as { served: { data: { title: string }[]; stale: boolean }; servedBeforeYahooAnswered: boolean; refreshed: { data: { title: string }[]; stale: boolean }; searchCalls: number; expiresInSeconds: number };

  assert.deepEqual(result.served.data.map((item) => item.title), ["Ancien article"]);
  assert.equal(result.served.stale, true);
  assert.equal(result.servedBeforeYahooAnswered, true, "the stale feed does not wait for Yahoo");
  assert.deepEqual(result.refreshed.data.map((item) => item.title), ["Nouvel article"]);
  assert.equal(result.refreshed.stale, false);
  assert.equal(result.searchCalls, 1);
  assert.equal(result.expiresInSeconds, 7 * 24 * 3600, "news rows expire with the stale rejection threshold");
});

test("a failing Yahoo refresh keeps serving the cached ticker feed", () => {
  const result = runBackendScript(`
    ${newsScriptSetup}
    const key = "news:ticker:AI.PA:fr";
    writeNewsCache(key, [article("Article en cache", "AI.PA")]);
    ageCache(key, hours(7));
    yahooClient.search = async () => { throw new Error("Yahoo down"); };

    const first = await fetchNews("AI.PA", ["fr"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await fetchNews("AI.PA", ["fr"]);
    console.log("__RESULT__" + JSON.stringify({ first, second }));
  `) as { first: { data: { title: string }[] }; second: { data: { title: string }[] } };

  assert.deepEqual(result.first.data.map((item) => item.title), ["Article en cache"]);
  assert.deepEqual(result.second.data.map((item) => item.title), ["Article en cache"], "the failed refresh does not erase the cache");
});

test("without any cache, a Yahoo failure yields an empty feed flagged as stale", () => {
  const result = runBackendScript(`
    ${newsScriptSetup}
    yahooClient.search = async () => { throw new Error("Yahoo down"); };
    const feed = await fetchCompanyNews("AI.PA", "Air Liquide", ["fr"]);
    const rows = db.prepare("SELECT COUNT(*) AS count FROM cache_entries WHERE scope = 'news'").get().count;
    console.log("__RESULT__" + JSON.stringify({ feed, rows }));
  `) as { feed: { data: unknown[]; stale: boolean }; rows: number };

  assert.deepEqual(result.feed, { data: [], stale: true });
  assert.equal(result.rows, 0);
});

test("company news keep only articles about the company, in every requested language", () => {
  const result = runBackendScript(`
    ${newsScriptSetup}
    const queries = [];
    yahooClient.search = async (query, options) => {
      queries.push(options.lang);
      return { news: [
        { title: "Air Liquide investit en Europe", link: "https://example.test/" + options.lang + "/air-liquide", providerPublishTime: 1784800000 },
        { title: "Le CAC 40 recule", link: "https://example.test/" + options.lang + "/cac", providerPublishTime: 1784800000 }
      ], quotes: [] };
    };
    const feed = await fetchCompanyNews("AI.PA", "Air Liquide", ["fr", "en"]);
    console.log("__RESULT__" + JSON.stringify({ urls: feed.data.map((item) => item.url).sort(), queries: queries.sort() }));
  `) as { urls: string[]; queries: string[] };

  assert.deepEqual(result.urls, ["https://example.test/en-US/air-liquide", "https://example.test/fr-FR/air-liquide"]);
  assert.deepEqual(result.queries, ["en-US", "fr-FR"]);
});

test("expired news rows are purged and the migration gives old rows an expiry", () => {
  const result = runBackendScript(`
    ${newsScriptSetup}
    const { cacheCleanupService } = await import("./services/shared/cache-cleanup.service.ts");
    const { expireNewsCacheMigration } = await import("./migrations/cache/046-expire-news-cache.ts");
    const now = Math.floor(Date.now() / 1000);
    db.prepare("INSERT INTO cache_entries (scope, key, payload, fetched_at, expires_at) VALUES ('news', 'NEWS:TICKER:OLD:FR', '[]', ?, NULL), ('news', 'news:assets:v5:1:fr:limit:8:offset:0:X', '[]', ?, NULL)").run(now, now);
    expireNewsCacheMigration.appliquer(db);
    const migrated = db.prepare("SELECT key, fetched_at, expires_at FROM cache_entries WHERE scope = 'news' ORDER BY key").all();

    writeNewsCache("news:ticker:NEW:fr", []);
    const beforeExpiry = cacheCleanupService.purgeExpired(Date.now()).deleted.cache_entries;
    const afterExpiry = cacheCleanupService.purgeExpired(Date.now() + 8 * 24 * 3600 * 1000).deleted.cache_entries;
    console.log("__RESULT__" + JSON.stringify({ migrated, beforeExpiry, afterExpiry }));
  `) as { migrated: { key: string; fetched_at: number; expires_at: number }[]; beforeExpiry: number; afterExpiry: number };

  assert.equal(result.migrated.length, 1, "aggregated pages of the old format are dropped");
  assert.equal(result.migrated[0]?.key, "NEWS:TICKER:OLD:FR");
  assert.equal(result.migrated[0].expires_at, (result.migrated[0].fetched_at + 7 * 24 * 3600) * 1000);
  assert.equal(result.beforeExpiry, 0);
  assert.equal(result.afterExpiry, 2);
});
