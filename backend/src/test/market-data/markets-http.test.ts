import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface OverviewItem {
  symbol: string;
  category: string;
  key: string;
  price: number;
  changePercent: number;
  sparkline: { t: number; v: number }[];
}

interface ListItem {
  symbol: string;
  trailingPE?: number;
  dividendYield?: number;
  marketCap?: number;
  peaEligible?: boolean;
}

interface MarketsResult {
  overview: { items: OverviewItem[] };
  quoteBatchCalls: string[][];
  list: { items: ListItem[]; peaOnly: boolean };
  peaOnly: { items: ListItem[]; peaOnly: boolean };
  screenerCalls: number;
  invalidStatuses: number[];
  disabledStatus: number;
  quoteCallsWhenDisabled: number;
  anonymousStatuses: number[];
}

test("markets page serves one cached quote batch with sparklines, lists with PEA filter and respects its switch", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooClient } = await import("./services/yahoo/yahoo.client.ts");
    const { featureFlagsService } = await import("./services/admin/feature-flags.service.ts");
    ${sessionUserHelpers}

    const user = createUserWithSession("user");
    const quoteBatchCalls = [];
    let screenerCalls = 0;
    yahooClient.quote = async (symbols) => {
      quoteBatchCalls.push([...symbols]);
      // Le taux américain n'est pas coté : il doit être ignoré sans casser la page.
      return symbols.filter((symbol) => symbol !== "^TNX").map((symbol, index) => ({
        symbol, shortName: symbol, regularMarketPrice: 100 + index, regularMarketChange: 1, regularMarketChangePercent: 1, currency: "EUR", marketState: "REGULAR"
      }));
    };
    yahooClient.chart = async (symbol) => {
      if (symbol === "^GDAXI") throw new Error("chart down");
      return { quotes: [
        { date: new Date("2026-08-01T00:00:00.000Z"), close: 10 },
        { date: new Date("2026-08-02T00:00:00.000Z"), close: 11 }
      ] };
    };
    yahooClient.screener = async () => {
      screenerCalls += 1;
      return { quotes: [
        { symbol: "TTE.PA", shortName: "TotalEnergies", regularMarketPrice: 60, regularMarketChange: 1, regularMarketChangePercent: 1.5, currency: "EUR", exchange: "PAR", fullExchangeName: "Paris", quoteType: "EQUITY", trailingPE: 8.5, trailingAnnualDividendYield: 0.052, marketCap: 140000000000 },
        { symbol: "AAPL", shortName: "Apple", regularMarketPrice: 200, regularMarketChange: -1, regularMarketChangePercent: -0.5, currency: "USD", exchange: "NMS", fullExchangeName: "NasdaqGS", quoteType: "EQUITY", trailingPE: -3 },
        { symbol: "BROKEN" }
      ] };
    };

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      const get = (path, cookie = user.cookie) => fetch(baseUrl + path, cookie ? { headers: { Cookie: cookie } } : {});
      try {
        const overview = await (await get("/api/markets/overview")).json();
        await get("/api/markets/overview");
        const callsAfterOverview = quoteBatchCalls.length;
        const list = await (await get("/api/market-lists/growth_technology_stocks")).json();
        const peaOnly = await (await get("/api/market-lists/growth_technology_stocks?peaOnly=true")).json();
        const invalidStatuses = [
          (await get("/api/market-lists/unknown_list")).status,
          (await get("/api/market-lists/day_gainers?peaOnly=maybe")).status
        ];
        const anonymousStatuses = [(await get("/api/markets/overview", null)).status, (await get("/api/market-lists/day_gainers", null)).status];
        featureFlagsService.update({ markets_page: false }, user.id);
        const disabled = await get("/api/markets/overview");
        console.log("__RESULT__" + JSON.stringify({
          overview, quoteBatchCalls, list, peaOnly, screenerCalls, invalidStatuses,
          disabledStatus: disabled.status, quoteCallsWhenDisabled: quoteBatchCalls.length - callsAfterOverview, anonymousStatuses
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as MarketsResult;

  const symbols = result.overview.items.map((item) => item.symbol);
  assert.deepEqual(symbols, ["^FCHI", "^STOXX50E", "^GDAXI", "^GSPC", "^IXIC", "EURUSD=X", "GC=F", "BZ=F"], "unquoted symbols are dropped");
  assert.equal(result.quoteBatchCalls[0]?.length, 9, "all symbols in a single batch");
  assert.deepEqual(result.quoteBatchCalls.slice(1), [["^TNX"]], "cached quotes are reused, only the missing symbol is asked again");
  const cac = result.overview.items[0];
  assert.equal(cac?.key, "cac40");
  assert.equal(cac.category, "indices");
  assert.deepEqual(cac.sparkline.map((point) => point.v), [10, 11]);
  assert.deepEqual(result.overview.items.find((item) => item.symbol === "^GDAXI")?.sparkline, [], "a failed sparkline keeps the quote");

  assert.deepEqual(result.list.items.map((item) => item.symbol), ["TTE.PA", "AAPL"]);
  assert.deepEqual(result.list.items[0] && { ...result.list.items[0] }, {
    ...result.list.items[0], trailingPE: 8.5, dividendYield: 0.052, marketCap: 140000000000, peaEligible: true
  });
  assert.equal(result.list.items[1]?.trailingPE, undefined, "a negative PER is not shown");
  assert.equal(result.list.items[1]?.peaEligible, false);
  assert.equal(result.list.peaOnly, false);
  assert.deepEqual(result.peaOnly.items.map((item) => item.symbol), ["TTE.PA"]);
  assert.equal(result.peaOnly.peaOnly, true);
  assert.equal(result.screenerCalls, 1, "the list is cached for the day, filtering reuses it");
  assert.deepEqual(result.invalidStatuses, [400, 400]);
  assert.equal(result.disabledStatus, 403);
  assert.equal(result.quoteCallsWhenDisabled, 0, "no Yahoo call when the page is switched off");
  assert.deepEqual(result.anonymousStatuses, [401, 401]);
});
