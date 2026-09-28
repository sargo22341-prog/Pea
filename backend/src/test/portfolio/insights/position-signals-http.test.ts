import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript } from "../../helpers/backend-script.js";
import { sessionUserHelpers } from "../../helpers/session-users.js";

interface SignalsResult {
  status: number;
  yieldOnCost: number;
  positions: Record<string, { yieldOnCost?: number; fiftyTwoWeekLow?: number; fiftyTwoWeekHigh?: number; consensusChange?: { from: string; to: string } }>;
  calendarStatus: number;
  calendar: { symbol: string; eventType: string; epsAverage?: number; revenueAverage?: number; currency?: string }[];
  anonymousStatus: number;
}

test("dashboard signals and calendar estimates are served for the current user's positions only", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { upsertCalendarEvents } = await import("./repositories/calendar-events/calendar-events.repository.ts");
    const { recordRecommendation } = await import("./services/market/analysts/recommendation-history.service.ts");
    ${helpers}
    ${sessionUserHelpers}

    const dividends = { "AAA.PA": 2, "BBB.PA": undefined, "ZZZ.PA": 5 };
    const row = (symbol) => {
      const priced = pricedQuoteRow(symbol, "CLOSED", 60);
      return { quote: { ...priced.quote, dividendRate: dividends[symbol] }, snapshot: priced.snapshot };
    };
    yahooApi.quote = async (symbol) => row(symbol);
    yahooApi.quoteBatchRaw = async (symbols) => symbols.map(row);
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });
    yahooApi.quoteSummary = async () => ({ profile: {}, raw: {} });

    const owner = createUserWithSession("owner");
    const other = createUserWithSession("other");
    for (const symbol of ["AAA.PA", "BBB.PA", "ZZZ.PA"]) db.prepare("INSERT INTO assets (symbol, name, currency) VALUES (?, ?, 'EUR')").run(symbol, symbol);
    const addPosition = (userId, symbol, quantity, price) =>
      db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, ?, ?, ?, ?, 'EUR')").run(userId, symbol, symbol, quantity, price);
    addPosition(owner.id, "AAA.PA", 10, 40);
    addPosition(owner.id, "BBB.PA", 5, 120);
    addPosition(other.id, "ZZZ.PA", 1, 10);

    recordRecommendation("AAA.PA", "hold", new Date(Date.now() - 2 * 86400000));
    recordRecommendation("AAA.PA", "buy", new Date(Date.now() - 86400000));
    const future = new Date(Date.now() + 10 * 86400000).toISOString();
    upsertCalendarEvents([
      { symbol: "AAA.PA", eventType: "earnings", eventDate: future, isEstimate: true, epsAverage: 1.25, revenueAverage: 3000000000 },
      { symbol: "ZZZ.PA", eventType: "earnings", eventDate: future, isEstimate: false, epsAverage: 9 }
    ]);

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      try {
        const summary = await fetch(baseUrl + "/api/portfolio?range=1d", { headers: { Cookie: owner.cookie } });
        const body = await summary.json();
        const calendar = await fetch(baseUrl + "/api/calendar-events", { headers: { Cookie: owner.cookie } });
        const anonymous = await fetch(baseUrl + "/api/calendar-events");
        console.log("__RESULT__" + JSON.stringify({
          status: summary.status,
          yieldOnCost: body.yieldOnCost,
          positions: Object.fromEntries(body.positions.map((position) => [position.symbol, position])),
          calendarStatus: calendar.status,
          calendar: await calendar.json(),
          anonymousStatus: anonymous.status
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as SignalsResult;

  assert.equal(result.status, 200);
  const aaa = result.positions["AAA.PA"];
  const bbb = result.positions["BBB.PA"];
  assert.ok(aaa && bbb);
  assert.equal(result.positions["ZZZ.PA"], undefined);
  assert.equal(aaa.yieldOnCost, 0.05, "2 EUR dividend on a 40 EUR average price");
  assert.equal(bbb.yieldOnCost, undefined, "no dividend, no yield on cost");
  assert.equal(result.yieldOnCost, 20 / 1000, "10 x 2 EUR over 400 + 600 EUR invested");
  assert.equal(aaa.fiftyTwoWeekLow, 49.24);
  assert.equal(aaa.fiftyTwoWeekHigh, 81.34);
  assert.deepEqual(aaa.consensusChange && { from: aaa.consensusChange.from, to: aaa.consensusChange.to }, { from: "hold", to: "buy" });
  assert.equal(bbb.consensusChange, undefined);

  assert.equal(result.calendarStatus, 200);
  assert.deepEqual(result.calendar.map((event) => [event.symbol, event.epsAverage, event.revenueAverage, event.currency]), [["AAA.PA", 1.25, 3000000000, "EUR"]]);
  assert.equal(result.anonymousStatus, 401);
});
