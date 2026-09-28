import type { CalendarEvent, CalendarEventType } from "@pea/shared";
import { db } from "../../db.js";

export interface CalendarEventInsert {
  symbol: string;
  eventType: CalendarEventType;
  eventDate: string;
  isEstimate: boolean;
  /** Consensus de la publication (événements `earnings` uniquement). */
  epsAverage?: number | undefined;
  revenueAverage?: number | undefined;
}

interface RawEventRow {
  id: number;
  symbol: string;
  event_type: CalendarEventType;
  event_date: string;
  is_estimate: number;
  asset_name: string | null;
  currency: string | null;
  eps_average: number | null;
  revenue_average: number | null;
}

/** Évènements passés puis à venir les plus proches, d'un actif ou des positions d'un utilisateur. */
function eventsQuery(scopeClause: string, pastLimit: number, futureLimit: number) {
  const columns = "ace.id, ace.symbol, ace.event_type, ace.event_date, ace.is_estimate, a.name AS asset_name, a.currency, ace.eps_average, ace.revenue_average";
  return `
    SELECT * FROM (
      SELECT ${columns}
      FROM asset_calendar_events ace LEFT JOIN assets a ON a.symbol = ace.symbol
      WHERE ${scopeClause} AND ace.event_date < datetime('now')
      ORDER BY ace.event_date DESC LIMIT ${pastLimit}
    )
    UNION ALL
    SELECT * FROM (
      SELECT ${columns}
      FROM asset_calendar_events ace LEFT JOIN assets a ON a.symbol = ace.symbol
      WHERE ${scopeClause} AND ace.event_date >= datetime('now')
      ORDER BY ace.event_date ASC LIMIT ${futureLimit}
    )
    ORDER BY event_date ASC
  `;
}

const SYMBOL_PAST_LIMIT = 20;
const PORTFOLIO_PAST_LIMIT = 10;
const FUTURE_LIMIT = 30;

export function upsertCalendarEvents(events: CalendarEventInsert[]) {
  const statement = db.prepare(`
    INSERT INTO asset_calendar_events (symbol, event_type, event_date, is_estimate, eps_average, revenue_average)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, event_type, event_date) DO UPDATE SET
      is_estimate = excluded.is_estimate,
      eps_average = COALESCE(excluded.eps_average, eps_average),
      revenue_average = COALESCE(excluded.revenue_average, revenue_average)
  `);
  for (const event of events) {
    statement.run(event.symbol.toUpperCase(), event.eventType, event.eventDate, event.isEstimate ? 1 : 0, event.epsAverage ?? null, event.revenueAverage ?? null);
  }
}

export function readCalendarEventsBySymbol(symbol: string) {
  const key = symbol.toUpperCase();
  return db.prepare(eventsQuery("ace.symbol = ?", SYMBOL_PAST_LIMIT, FUTURE_LIMIT)).all(key, key) as RawEventRow[];
}

export function readCalendarEventsForPortfolio(userId: number) {
  const scope = "ace.symbol IN (SELECT symbol FROM positions WHERE user_id = ?)";
  return db.prepare(eventsQuery(scope, PORTFOLIO_PAST_LIMIT, FUTURE_LIMIT)).all(userId, userId) as RawEventRow[];
}

/** Première date d'un type d'évènement à partir de `fromIso` (par exemple le prochain détachement annoncé). */
export function readNextEventDate(symbol: string, eventType: CalendarEventType, fromIso: string): string | undefined {
  const row = db.prepare(
    "SELECT event_date FROM asset_calendar_events WHERE symbol = ? AND event_type = ? AND event_date >= ? ORDER BY event_date ASC LIMIT 1"
  ).get(symbol.toUpperCase(), eventType, fromIso) as { event_date: string } | undefined;
  return row?.event_date;
}

export function mapEventRow(row: RawEventRow): CalendarEvent {
  return {
    id: row.id,
    symbol: row.symbol,
    eventType: row.event_type,
    eventDate: row.event_date,
    isEstimate: row.is_estimate === 1,
    assetName: row.asset_name ?? row.symbol,
    currency: row.currency ?? undefined,
    epsAverage: row.eps_average ?? undefined,
    revenueAverage: row.revenue_average ?? undefined
  };
}
