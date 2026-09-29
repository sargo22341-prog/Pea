import { nextCalendarDay, type CalendarEvent, type CalendarScope } from "@pea/shared";
import { mapEventRow, readCalendarEventsInRange } from "../../repositories/calendar-events/calendar-events.repository.js";
import { logger } from "../shared/logger.service.js";
import { dividendService } from "../portfolio/dividends/dividend.service.js";
import { withExpectedDividends } from "./expected-dividends.js";

export interface CalendarRangeQuery {
  scope: CalendarScope;
  /** Premier jour inclus, `YYYY-MM-DD`. */
  from: string;
  /** Dernier jour inclus, `YYYY-MM-DD`. */
  to: string;
}

const hasDividendEvent = (events: readonly CalendarEvent[]) => events.some((event) => event.eventType === "ex_dividend" || event.eventType === "dividend");

/**
 * Évènements des actifs de l'utilisateur sur une plage. Les détachements et versements des
 * positions reçoivent le montant attendu ; les actifs seulement suivis n'en ont jamais, faute de
 * quantité détenue.
 */
export async function calendarEventsInRange(userId: number, query: CalendarRangeQuery): Promise<CalendarEvent[]> {
  const events = readCalendarEventsInRange(userId, query.scope, query.from, nextCalendarDay(query.to)).map(mapEventRow);
  if (query.scope === "watchlist" || !hasDividendEvent(events)) return events;
  try {
    const dividends = await dividendService.portfolioDividends(userId);
    return withExpectedDividends(events, [...dividends.past, ...dividends.upcoming]);
  } catch (error) {
    // Les montants sont un complément : sans eux, le calendrier reste utile.
    logger.warn("market-data", "Montants de dividendes indisponibles pour le calendrier", { userId, error: error instanceof Error ? error.message : String(error) });
    return events;
  }
}
