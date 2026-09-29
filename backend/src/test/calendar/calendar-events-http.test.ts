import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface EventResult {
  symbol: string;
  eventType: string;
  expectedDividend?: { amount: number; amountPerShare: number; quantity: number; status: string };
}

interface CalendarHttpResult {
  portfolio: EventResult[];
  watchlist: EventResult[];
  all: EventResult[];
  otherUser: EventResult[];
  nearestStatus: number;
  invalidStatuses: number[];
  ics: { status: number; contentType: string | null; disposition: string | null; body: string };
  anonymousStatuses: number[];
}

test("calendar range lists the current user's events by scope with expected dividends and an iCal export", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { upsertCalendarEvents } = await import("./repositories/calendar-events/calendar-events.repository.ts");
    const { dividendsRepository } = await import("./repositories/market/dividends.repository.ts");
    ${helpers}
    ${sessionUserHelpers}

    const row = (symbol) => pricedQuoteRow(symbol, "CLOSED", 60);
    yahooApi.quote = async (symbol) => row(symbol);
    yahooApi.quoteBatchRaw = async (symbols) => symbols.map(row);
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });
    yahooApi.quoteSummary = async () => { throw new Error("no Yahoo call expected"); };

    const owner = createUserWithSession("owner");
    const other = createUserWithSession("other");
    for (const symbol of ["AAA.PA", "WWW.PA", "ZZZ.PA"]) db.prepare("INSERT INTO assets (symbol, name, currency) VALUES (?, ?, 'EUR')").run(symbol, symbol + " SA, Paris");
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'AAA.PA', 'AAA', 10, 40, 'EUR')").run(owner.id);
    db.prepare("INSERT INTO watchlist (user_id, symbol, name) VALUES (?, 'WWW.PA', 'WWW')").run(owner.id);
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'ZZZ.PA', 'ZZZ', 1, 10, 'EUR')").run(other.id);
    const assetId = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get().id;
    dividendsRepository.upsert(assetId, { date: "2025-06-05T00:00:00.000Z", amount: 2, currency: "EUR" });
    upsertCalendarEvents([
      { symbol: "AAA.PA", eventType: "ex_dividend", eventDate: "2025-06-05T00:00:00.000Z", isEstimate: false },
      { symbol: "AAA.PA", eventType: "earnings", eventDate: "2025-06-20T00:00:00.000Z", isEstimate: true, epsAverage: 1.25 },
      { symbol: "AAA.PA", eventType: "earnings", eventDate: "2024-01-10T00:00:00.000Z", isEstimate: false },
      { symbol: "WWW.PA", eventType: "earnings", eventDate: "2025-06-10T00:00:00.000Z", isEstimate: false },
      { symbol: "ZZZ.PA", eventType: "earnings", eventDate: "2025-06-11T00:00:00.000Z", isEstimate: false }
    ]);

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      const range = "from=2025-06-01&to=2025-06-30";
      const get = (path, cookie) => fetch(baseUrl + path, cookie ? { headers: { Cookie: cookie } } : {});
      const json = async (path, cookie) => (await get(path, cookie)).json();
      try {
        const invalid = [
          "/api/calendar-events?from=2025-06-31&to=2025-07-02",
          "/api/calendar-events?from=2025-06-30&to=2025-06-01",
          "/api/calendar-events?from=2024-01-01&to=2025-06-01",
          "/api/calendar-events?from=2025-06-01&to=2025-06-30&scope=everyone",
          "/api/calendar-events?from=2025-06-01",
          "/api/calendar-events.ics?from=2025-06-01"
        ];
        const ics = await get("/api/calendar-events.ics?scope=all&" + range, owner.cookie);
        console.log("__RESULT__" + JSON.stringify({
          portfolio: await json("/api/calendar-events?" + range, owner.cookie),
          watchlist: await json("/api/calendar-events?scope=watchlist&" + range, owner.cookie),
          all: await json("/api/calendar-events?scope=all&" + range, owner.cookie),
          otherUser: await json("/api/calendar-events?scope=all&" + range, other.cookie),
          nearestStatus: (await get("/api/calendar-events", owner.cookie)).status,
          invalidStatuses: await Promise.all(invalid.map(async (path) => (await get(path, owner.cookie)).status)),
          ics: { status: ics.status, contentType: ics.headers.get("content-type"), disposition: ics.headers.get("content-disposition"), body: await ics.text() },
          anonymousStatuses: [(await get("/api/calendar-events?" + range)).status, (await get("/api/calendar-events.ics?" + range)).status]
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as CalendarHttpResult;

  const summarize = (events: EventResult[]) => events.map((event) => `${event.symbol}:${event.eventType}`);
  assert.deepEqual(summarize(result.portfolio), ["AAA.PA:ex_dividend", "AAA.PA:earnings"]);
  assert.deepEqual(result.portfolio[0]?.expectedDividend && { ...result.portfolio[0].expectedDividend }, {
    amount: 20, amountPerShare: 2, quantity: 10, currency: "EUR", status: "real"
  });
  assert.equal(result.portfolio[1]?.expectedDividend, undefined, "earnings never carry a dividend amount");
  assert.deepEqual(summarize(result.watchlist), ["WWW.PA:earnings"]);
  assert.deepEqual(summarize(result.all), ["AAA.PA:ex_dividend", "WWW.PA:earnings", "AAA.PA:earnings"]);
  assert.deepEqual(summarize(result.otherUser), ["ZZZ.PA:earnings"], "another user's assets are never listed");
  assert.equal(result.nearestStatus, 200);
  assert.deepEqual(result.invalidStatuses, [400, 400, 400, 400, 400, 400]);

  assert.equal(result.ics.status, 200);
  assert.match(result.ics.contentType ?? "", /^text\/calendar/);
  assert.match(result.ics.disposition ?? "", /attachment; filename="pea-calendrier-2025-06-01-2025-06-30\.ics"/);
  assert.ok(result.ics.body.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(result.ics.body.endsWith("END:VCALENDAR\r\n"));
  assert.equal(result.ics.body.match(/BEGIN:VEVENT/g)?.length, 3);
  assert.match(result.ics.body, /DTSTART;VALUE=DATE:20250605\r\nDTEND;VALUE=DATE:20250606/);
  assert.match(result.ics.body, /SUMMARY:Détachement du dividende - AAA\.PA SA\\, Paris \(AAA\.PA\)/);
  assert.doesNotMatch(result.ics.body, /ZZZ\.PA/);
  assert.deepEqual(result.anonymousStatuses, [401, 401]);
});
