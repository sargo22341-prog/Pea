import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript } from "../../helpers/backend-script.js";
import { sessionUserHelpers } from "../../helpers/session-users.js";

interface DividendEventResult {
  symbol: string;
  date: string;
  status: string;
  amountPerShare: number;
  totalAmount: number;
  payoutRatio?: number;
}

interface DividendsResult {
  upcoming: DividendEventResult[];
  expectedAnnualIncome?: number;
  marketValue?: number;
  httpStatus: number;
  httpSymbols: string[];
  httpPayoutRatio?: number;
  anonymousStatus: number;
}

test("portfolio dividends prefer an announced ex-date and expose sustainability data of the user's positions only", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { writeCache } = await import("./services/yahoo/cache/yahoo.cache.ts");
    const { upsertCalendarEvents } = await import("./repositories/calendar-events/calendar-events.repository.ts");
    const { dividendsRepository } = await import("./repositories/market/dividends.repository.ts");
    const { dividendService } = await import("./services/portfolio/dividends/dividend.service.ts");
    ${helpers}
    ${sessionUserHelpers}

    const rates = { "AAA.PA": 3.6, "ZZZ.PA": 1 };
    const row = (symbol) => {
      const priced = pricedQuoteRow(symbol, "CLOSED", 60);
      return { quote: { ...priced.quote, dividendRate: rates[symbol] }, snapshot: priced.snapshot };
    };
    yahooApi.quote = async (symbol) => row(symbol);
    yahooApi.quoteBatchRaw = async (symbols) => symbols.map(row);
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });
    yahooApi.quoteSummary = async () => { throw new Error("no Yahoo call expected"); };

    const owner = createUserWithSession("owner");
    const other = createUserWithSession("other");
    for (const symbol of ["AAA.PA", "ZZZ.PA"]) db.prepare("INSERT INTO assets (symbol, name, currency) VALUES (?, ?, 'EUR')").run(symbol, symbol);
    const assetId = (symbol) => db.prepare("SELECT id FROM assets WHERE symbol = ?").get(symbol).id;
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'AAA.PA', 'AAA', 10, 40, 'EUR')").run(owner.id);
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'ZZZ.PA', 'ZZZ', 1, 10, 'EUR')").run(other.id);

    // Solde de juin et acompte de décembre l'an dernier, puis détachement de juin annoncé.
    dividendsRepository.upsert(assetId("AAA.PA"), { date: "2025-06-05T00:00:00.000Z", amount: 2, currency: "EUR" });
    dividendsRepository.upsert(assetId("AAA.PA"), { date: "2025-12-05T00:00:00.000Z", amount: 1, currency: "EUR" });
    upsertCalendarEvents([{ symbol: "AAA.PA", eventType: "ex_dividend", eventDate: "2026-06-02T00:00:00.000Z", isEstimate: false }]);
    writeCache("cached_fundamentals", "AAA.PA", { summaryDetail: { payoutRatio: 0.55 } });
    writeCache("cached_fundamentals", "ZZZ.PA", { summaryDetail: { payoutRatio: 0.95 } });

    const dividends = await dividendService.portfolioDividends(owner.id, new Date("2026-03-01T12:00:00.000Z"));

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      try {
        const response = await fetch(baseUrl + "/api/portfolio/dividends", { headers: { Cookie: owner.cookie } });
        const body = await response.json();
        const anonymous = await fetch(baseUrl + "/api/portfolio/dividends");
        const events = [...body.past, ...body.upcoming];
        console.log("__RESULT__" + JSON.stringify({
          upcoming: dividends.upcoming,
          expectedAnnualIncome: dividends.expectedAnnualIncome,
          marketValue: dividends.marketValue,
          httpStatus: response.status,
          httpSymbols: [...new Set(events.map((event) => event.symbol))],
          httpPayoutRatio: events[0]?.payoutRatio,
          anonymousStatus: anonymous.status
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as DividendsResult;

  assert.deepEqual(result.upcoming.map((event) => [event.date.slice(0, 10), event.status, Number(event.amountPerShare.toFixed(6)), Number(event.totalAmount.toFixed(6))]), [
    ["2026-06-02", "announced", 2.4, 24],
    ["2026-12-05", "estimated", 1, 10]
  ], "the announced June payment replaces last year's June estimate, scaled to the new annual dividend");
  assert.ok(result.upcoming.every((event) => event.payoutRatio === 0.55));
  assert.equal(result.expectedAnnualIncome, 36);
  assert.equal(result.marketValue, 600);

  assert.equal(result.httpStatus, 200);
  assert.deepEqual(result.httpSymbols, ["AAA.PA"], "another user's position never appears");
  assert.equal(result.httpPayoutRatio, 0.55);
  assert.equal(result.anonymousStatus, 401);
});
