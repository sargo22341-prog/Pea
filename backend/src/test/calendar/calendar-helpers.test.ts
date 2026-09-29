import assert from "node:assert/strict";
import test from "node:test";
import { calendarEventDay, nextCalendarDay, type CalendarEvent, type PortfolioDividendEvent } from "@pea/shared";
import { buildCalendarIcs, escapeIcsText, foldIcsLine } from "../../services/calendar/calendar-ics.js";
import { withExpectedDividends } from "../../services/calendar/expected-dividends.js";

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return { id: 1, symbol: "AAA.PA", eventType: "ex_dividend", eventDate: "2026-06-02T00:00:00.000Z", isEstimate: false, assetName: "AAA", currency: "EUR", ...overrides };
}

function payment(overrides: Partial<PortfolioDividendEvent>): PortfolioDividendEvent {
  return { symbol: "AAA.PA", name: "AAA", date: "2026-06-05T00:00:00.000Z", year: 2026, amountPerShare: 2, quantity: 10, totalAmount: 20, currency: "EUR", status: "announced", ...overrides };
}

test("expected dividends match the closest payment of the same position within the matching window", () => {
  const [exDate, paymentDay, earnings, farAway, watchedOnly] = withExpectedDividends([
    event({ id: 1 }),
    event({ id: 2, eventType: "dividend", eventDate: "2026-06-20T00:00:00.000Z" }),
    event({ id: 3, eventType: "earnings" }),
    event({ id: 4, eventDate: "2026-10-01T00:00:00.000Z" }),
    event({ id: 5, symbol: "WWW.PA" })
  ], [
    payment({ date: "2026-05-01T00:00:00.000Z", amountPerShare: 9, totalAmount: 90, status: "real" }),
    payment({})
  ]);
  assert.equal(exDate?.expectedDividend?.amount, 20, "the closest payment wins over an older one in the window");
  assert.equal(exDate.expectedDividend.status, "announced");
  assert.equal(paymentDay?.expectedDividend?.amount, 20, "a payment date a few weeks after the ex-date gets the same amount");
  assert.equal(earnings?.expectedDividend, undefined);
  assert.equal(farAway?.expectedDividend, undefined, "no payment within 45 days");
  assert.equal(watchedOnly?.expectedDividend, undefined, "a symbol without position has no amount");
});

test("expected dividends ignore payments made while no share was held", () => {
  const [exDate] = withExpectedDividends([event({})], [payment({ quantity: 0, totalAmount: 0 })]);
  assert.equal(exDate?.expectedDividend, undefined);
});

test("calendar day keeps date-only events on their day whatever the time zone", () => {
  assert.equal(calendarEventDay("2026-06-02T00:00:00.000Z", "America/New_York"), "2026-06-02");
  assert.equal(calendarEventDay("2026-06-02T23:30:00.000Z", "Europe/Paris"), "2026-06-03");
  assert.equal(calendarEventDay("2026-06-02T12:00:00.000Z", "Europe/Paris"), "2026-06-02");
  assert.equal(calendarEventDay("not a date", "Europe/Paris"), undefined);
  assert.equal(nextCalendarDay("2026-02-28"), "2026-03-01");
  assert.equal(nextCalendarDay("2026-12-31"), "2027-01-01");
});

test("iCal text is escaped and long lines are folded without splitting a character", () => {
  assert.equal(escapeIcsText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  const line = `SUMMARY:${"é".repeat(60)}`;
  const folded = foldIcsLine(line);
  const parts = folded.split("\r\n");
  assert.ok(parts.length > 1);
  for (const part of parts) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(parts.map((part, index) => (index === 0 ? part : part.slice(1))).join(""), line);
  assert.ok(parts.slice(1).every((part) => part.startsWith(" ")));
});

test("iCal export lists all-day events with estimates and expected amounts", () => {
  const ics = buildCalendarIcs([
    event({ id: 7, eventType: "earnings", isEstimate: true, epsAverage: 1.5, eventDate: "2026-07-24T00:00:00.000Z" }),
    event({ id: 8, expectedDividend: { amount: 20, amountPerShare: 2, quantity: 10, currency: "EUR", status: "estimated" } })
  ], { language: "en", timeZone: "Europe/Paris", now: new Date("2026-06-01T08:30:00.000Z") });
  const lines = ics.split("\r\n");
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.ok(lines.includes("UID:earnings-7@pea-portfolio"));
  assert.ok(lines.includes("DTSTAMP:20260601T083000Z"));
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20260724"));
  assert.ok(lines.includes("SUMMARY:Earnings - AAA (AAA.PA)"));
  assert.ok(lines.includes("DESCRIPTION:Estimated date\\nExpected EPS : €1.50"));
  assert.ok(lines.includes("DESCRIPTION:Expected amount : €20.00"));
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 2);
});
