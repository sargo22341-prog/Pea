import type { AssetCalendarEventsData } from "@pea/shared";
import type { CalendarEventInsert } from "../../../../repositories/calendar-events/calendar-events.repository.js";
import { rawArray, type YahooSummaryRaw } from "../../yahoo.raw.js";
import { firstRawDate, rawDate, rawNumber } from "../../utils/raw-values.js";

export function calendarEventsDataFromSummary(summary: YahooSummaryRaw): AssetCalendarEventsData | undefined {
  const calendar = summary.calendarEvents;
  if (!calendar || !Object.keys(calendar).length) return undefined;
  const earnings = calendar.earnings ?? {};
  return {
    earningsDate: firstRawDate(earnings.earningsDate),
    earningsCallDate: firstRawDate(earnings.earningsCallDate),
    isEarningsDateEstimate: Boolean(earnings.isEarningsDateEstimate),
    exDividendDate: rawDate(calendar.exDividendDate),
    dividendDate: rawDate(calendar.dividendDate)
  };
}

function datesOf(value: unknown) {
  return (Array.isArray(value) ? rawArray<unknown>(value) : [value]).flatMap((entry) => {
    const date = rawDate(entry);
    return date ? [date] : [];
  });
}

/**
 * Évènements datés à conserver dans le calendrier local. Le consensus BPA / chiffre d'affaires
 * concerne la prochaine publication : il n'est rattaché qu'à la première date de résultats.
 */
export function calendarEventInsertsFromSummary(symbol: string, summary: YahooSummaryRaw): CalendarEventInsert[] {
  const calendar = summary.calendarEvents;
  if (!calendar) return [];
  const earnings = calendar.earnings ?? {};
  const isEstimate = Boolean(earnings.isEarningsDateEstimate);
  const events: CalendarEventInsert[] = datesOf(earnings.earningsDate).map((eventDate, index) => ({
    symbol,
    eventType: "earnings",
    eventDate,
    isEstimate,
    ...(index === 0 ? { epsAverage: rawNumber(earnings.earningsAverage), revenueAverage: rawNumber(earnings.revenueAverage) } : {})
  }));
  for (const eventDate of datesOf(earnings.earningsCallDate)) events.push({ symbol, eventType: "earnings_call", eventDate, isEstimate: false });
  const exDividend = rawDate(calendar.exDividendDate);
  if (exDividend) events.push({ symbol, eventType: "ex_dividend", eventDate: exDividend, isEstimate: false });
  const dividend = rawDate(calendar.dividendDate);
  if (dividend) events.push({ symbol, eventType: "dividend", eventDate: dividend, isEstimate: false });
  return events;
}
