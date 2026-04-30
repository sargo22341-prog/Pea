import assert from "node:assert/strict";
import test from "node:test";
import { getMarketSessionInfo } from "../market/marketCalendar.service.js";
import { zonedTimeToUtc } from "./date-time.service.js";

test("market sessions expose the real exchange timezone and hours", () => {
  assert.deepEqual(getMarketSessionInfo("AIR.PA", "Paris"), {
    timezone: "Europe/Paris",
    city: "Paris",
    open: "09:00",
    close: "17:30"
  });
  assert.deepEqual(getMarketSessionInfo("AAPL", "NASDAQ"), {
    timezone: "America/New_York",
    city: "New York",
    open: "09:30",
    close: "16:00"
  });
  assert.deepEqual(getMarketSessionInfo("SAP.DE", "XETRA"), {
    timezone: "Europe/Berlin",
    city: "Frankfurt",
    open: "09:00",
    close: "17:30"
  });
  assert.deepEqual(getMarketSessionInfo("VOD.L", "London"), {
    timezone: "Europe/London",
    city: "London",
    open: "08:00",
    close: "16:30"
  });
});

test("market timezone stays distinct from the user display timezone", () => {
  const userTimezone = "Europe/Paris";
  const marketSession = getMarketSessionInfo("MSFT", "NYSE");

  assert.equal(marketSession.timezone, "America/New_York");
  assert.notEqual(marketSession.timezone, userTimezone);
});

test("zoned market hours keep UTC truth across summer and winter time", () => {
  const parisSummerOpen = zonedTimeToUtc("2026-07-01", "09:00", "Europe/Paris");
  const parisWinterOpen = zonedTimeToUtc("2026-01-05", "09:00", "Europe/Paris");
  const nySummerOpen = zonedTimeToUtc("2026-07-01", "09:30", "America/New_York");
  const nyWinterOpen = zonedTimeToUtc("2026-01-05", "09:30", "America/New_York");

  assert.equal(parisSummerOpen.toISOString(), "2026-07-01T07:00:00.000Z");
  assert.equal(parisWinterOpen.toISOString(), "2026-01-05T08:00:00.000Z");
  assert.equal(nySummerOpen.toISOString(), "2026-07-01T13:30:00.000Z");
  assert.equal(nyWinterOpen.toISOString(), "2026-01-05T14:30:00.000Z");
});
