import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

interface StoredEvent {
  event_type: string;
  event_date: string;
  is_estimate: number;
}

test("a confirmed earnings date replaces the estimated one instead of adding a second publication", () => {
  const rows = runBackendScript(`
    const { db } = await import("./db.ts");
    const { replaceUpcomingCalendarEvents, upsertCalendarEvents } = await import("./repositories/calendar-events/calendar-events.repository.ts");
    const now = "2026-09-29T12:00:00.000Z";
    upsertCalendarEvents([
      { symbol: "STMPA.PA", eventType: "earnings", eventDate: "2026-07-24T15:30:00.000Z", isEstimate: false },
      { symbol: "STMPA.PA", eventType: "earnings", eventDate: "2026-10-22T15:30:00.000Z", isEstimate: true },
      { symbol: "STMPA.PA", eventType: "ex_dividend", eventDate: "2026-12-15T00:00:00.000Z", isEstimate: false },
      { symbol: "OTHER.PA", eventType: "earnings", eventDate: "2026-10-22T15:30:00.000Z", isEstimate: true }
    ]);
    // Le résumé suivant ne connaît plus que la date confirmée, et aucun détachement.
    replaceUpcomingCalendarEvents("stmpa.pa", [
      { symbol: "STMPA.PA", eventType: "earnings", eventDate: "2026-10-29T15:30:00.000Z", isEstimate: false }
    ], now);
    console.log("__RESULT__" + JSON.stringify(db.prepare(
      "SELECT symbol || ' ' || event_type AS event_type, event_date, is_estimate FROM asset_calendar_events ORDER BY symbol, event_type, event_date"
    ).all()));
  `) as StoredEvent[];

  assert.deepEqual(rows, [
    { event_type: "OTHER.PA earnings", event_date: "2026-10-22T15:30:00.000Z", is_estimate: 1 },
    { event_type: "STMPA.PA earnings", event_date: "2026-07-24T15:30:00.000Z", is_estimate: 0 },
    { event_type: "STMPA.PA earnings", event_date: "2026-10-29T15:30:00.000Z", is_estimate: 0 },
    { event_type: "STMPA.PA ex_dividend", event_date: "2026-12-15T00:00:00.000Z", is_estimate: 0 }
  ], "past history, other assets and types missing from the summary are kept");
});
