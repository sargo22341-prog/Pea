/**
 * Role du fichier : persister et lire les evenements calendrier des actifs.
 * Les events ne sont jamais supprimes : on accumule l'historique meme quand
 * Yahoo retire les dates passees de son API.
 */

import { db } from "../../db.js";

type EventType = "earnings" | "earnings_call" | "ex_dividend" | "dividend";

interface CalendarEventInsert {
  symbol: string;
  eventType: EventType;
  eventDate: string;
  isEstimate: boolean;
}

function toIsoDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const raw = value && typeof value === "object" && "raw" in value ? (value as { raw?: unknown }).raw : value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof raw === "number" && Number.isFinite(raw)) return new Date(raw * 1000).toISOString();
  if (typeof raw === "string") {
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
  }
  return undefined;
}

function extractFromSummary(symbol: string, summary: any): CalendarEventInsert[] {
  const cal = summary?.calendarEvents;
  if (!cal) return [];

  const events: CalendarEventInsert[] = [];
  const earnings = cal.earnings ?? {};
  const isEstimate = Boolean(earnings.isEarningsDateEstimate);

  const earningsDates: unknown[] = Array.isArray(earnings.earningsDate)
    ? earnings.earningsDate
    : earnings.earningsDate ? [earnings.earningsDate] : [];

  for (const d of earningsDates) {
    const date = toIsoDate(d);
    if (date) events.push({ symbol, eventType: "earnings", eventDate: date, isEstimate });
  }

  const callDates: unknown[] = Array.isArray(earnings.earningsCallDate)
    ? earnings.earningsCallDate
    : earnings.earningsCallDate ? [earnings.earningsCallDate] : [];

  for (const d of callDates) {
    const date = toIsoDate(d);
    if (date) events.push({ symbol, eventType: "earnings_call", eventDate: date, isEstimate: false });
  }

  const exDiv = toIsoDate(cal.exDividendDate);
  if (exDiv) events.push({ symbol, eventType: "ex_dividend", eventDate: exDiv, isEstimate: false });

  const divPayment = toIsoDate(cal.dividendDate);
  if (divPayment) events.push({ symbol, eventType: "dividend", eventDate: divPayment, isEstimate: false });

  return events;
}

const upsertStmt = db.prepare(`
  INSERT INTO asset_calendar_events (symbol, event_type, event_date, is_estimate)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(symbol, event_type, event_date) DO UPDATE SET is_estimate = excluded.is_estimate
`);

export function upsertCalendarEvents(symbol: string, summary: any) {
  const events = extractFromSummary(symbol.toUpperCase(), summary);
  for (const ev of events) {
    upsertStmt.run(ev.symbol, ev.eventType, ev.eventDate, ev.isEstimate ? 1 : 0);
  }
}

export function readCalendarEventsBySymbol(symbol: string) {
  return db.prepare(`
    SELECT ace.id, ace.symbol, ace.event_type, ace.event_date, ace.is_estimate,
           a.name as asset_name
    FROM asset_calendar_events ace
    LEFT JOIN assets a ON a.symbol = ace.symbol
    WHERE ace.symbol = ?
    ORDER BY ace.event_date ASC
  `).all(symbol.toUpperCase()) as RawEventRow[];
}

export function readCalendarEventsForPortfolio(userId: number) {
  return db.prepare(`
    SELECT ace.id, ace.symbol, ace.event_type, ace.event_date, ace.is_estimate,
           a.name as asset_name
    FROM asset_calendar_events ace
    LEFT JOIN assets a ON a.symbol = ace.symbol
    WHERE ace.symbol IN (SELECT symbol FROM positions WHERE user_id = ?)
    ORDER BY ace.event_date ASC
  `).all(userId) as RawEventRow[];
}

interface RawEventRow {
  id: number;
  symbol: string;
  event_type: string;
  event_date: string;
  is_estimate: number;
  asset_name: string | null;
}

export function mapEventRow(row: RawEventRow) {
  return {
    id: row.id,
    symbol: row.symbol,
    eventType: row.event_type as EventType,
    eventDate: row.event_date,
    isEstimate: row.is_estimate === 1,
    assetName: row.asset_name ?? row.symbol
  };
}
