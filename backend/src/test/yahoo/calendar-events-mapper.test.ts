import assert from "node:assert/strict";
import test from "node:test";
import type { YahooSummaryRaw } from "../../services/yahoo/yahoo.raw.js";
import { calendarEventInsertsFromSummary } from "../../services/yahoo/fundamentals/mappers/calendar.mapper.js";
import { yahooFixture } from "../helpers/yahoo-fixtures.js";

const summary = (name: string) => yahooFixture(`${name}.summary.json`) as YahooSummaryRaw;

test("calendar events carry the EPS and revenue consensus of the next publication", () => {
  const events = calendarEventInsertsFromSummary("ASML.AS", summary("asml-analysts"));

  assert.deepEqual(events, [
    { symbol: "ASML.AS", eventType: "earnings", eventDate: "2026-10-14T15:30:00.000Z", isEstimate: false, epsAverage: 10.58262, revenueAverage: 11659847070 },
    { symbol: "ASML.AS", eventType: "earnings_call", eventDate: "2026-07-15T13:00:00.000Z", isEstimate: false },
    { symbol: "ASML.AS", eventType: "ex_dividend", eventDate: "2026-07-27T00:00:00.000Z", isEstimate: false }
  ]);
});

test("only the first earnings date of a range receives the consensus", () => {
  const events = calendarEventInsertsFromSummary("AI.PA", {
    calendarEvents: {
      earnings: {
        earningsDate: ["2026-10-20T00:00:00.000Z", "2026-10-24T00:00:00.000Z"],
        isEarningsDateEstimate: true,
        revenueAverage: 7_000_000_000
      }
    }
  });

  assert.deepEqual(events.map((event) => [event.eventDate, event.isEstimate, event.revenueAverage, event.epsAverage]), [
    ["2026-10-20T00:00:00.000Z", true, 7_000_000_000, undefined],
    ["2026-10-24T00:00:00.000Z", true, undefined, undefined]
  ]);
});

test("a summary without calendar produces no event", () => {
  assert.deepEqual(calendarEventInsertsFromSummary("EMPTY.PA", summary("empty")), []);
});
