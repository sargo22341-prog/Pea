import type { CalendarEvent, CalendarScope } from "@pea/shared";
import { dedupedRequest, requestBlob } from "../api-core";

/** Plage du calendrier : jours `YYYY-MM-DD` inclus. */
export interface CalendarRange {
  scope: CalendarScope;
  from: string;
  to: string;
}

function rangeQuery({ scope, from, to }: CalendarRange) {
  return new URLSearchParams({ scope, from, to }).toString();
}

export const calendarApi = {
  calendarRange: (range: CalendarRange, signal?: AbortSignal) =>
    dedupedRequest<CalendarEvent[]>(`/api/calendar-events?${rangeQuery(range)}`, signal),
  /** Fichier iCalendar de la plage (session ou jeton natif transmis comme pour les autres appels). */
  calendarIcs: (range: CalendarRange) => requestBlob(`/api/calendar-events.ics?${rangeQuery(range)}`)
};
