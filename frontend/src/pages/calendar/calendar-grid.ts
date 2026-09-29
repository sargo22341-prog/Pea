import { calendarEventDay, type CalendarEvent, type CalendarEventType } from "@pea/shared";
import { localIsoDate } from "../../lib/timezone";

/** Familles d'évènements filtrables (une conférence de résultats est rangée avec les résultats). */
export const CALENDAR_EVENT_FAMILIES = ["earnings", "ex_dividend", "dividend"] as const;
export type CalendarEventFamily = (typeof CALENDAR_EVENT_FAMILIES)[number];

export function eventFamily(type: CalendarEventType): CalendarEventFamily {
  return type === "earnings_call" ? "earnings" : type;
}

export interface CalendarGridDay {
  day: string;
  inMonth: boolean;
}

const DAYS_PER_WEEK = 7;

function utcDay(day: string) {
  return new Date(`${day}T00:00:00.000Z`);
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Mois courant (`YYYY-MM`) dans le fuseau de l'application. */
export function currentMonth(timeZone: string, now = new Date()) {
  return localIsoDate(now, timeZone).slice(0, 7);
}

export function shiftMonth(month: string, delta: number) {
  const date = utcDay(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return isoDay(date).slice(0, 7);
}

/** Semaines complètes (lundi → dimanche) couvrant le mois : jours hors mois inclus en bordure. */
export function monthGridDays(month: string): CalendarGridDay[] {
  const first = utcDay(`${month}-01`);
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK));
  const last = utcDay(`${shiftMonth(month, 1)}-01`);
  last.setUTCDate(last.getUTCDate() - 1);
  const end = new Date(last);
  end.setUTCDate(last.getUTCDate() + ((DAYS_PER_WEEK - last.getUTCDay()) % DAYS_PER_WEEK));

  const days: CalendarGridDay[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = isoDay(cursor);
    days.push({ day, inMonth: day.startsWith(month) });
  }
  return days;
}

/** Plage demandée au serveur : la grille entière, pour remplir aussi les jours en bordure. */
export function monthRange(month: string) {
  const days = monthGridDays(month);
  return { from: days[0]?.day ?? `${month}-01`, to: days.at(-1)?.day ?? `${month}-28` };
}

/** Évènements rangés par jour civil, dans l'ordre reçu (date puis symbole). */
export function groupEventsByDay(events: readonly CalendarEvent[], timeZone: string) {
  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const day = calendarEventDay(event.eventDate, timeZone);
    if (!day) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }
  return byDay;
}

/** Jour complet dans la langue de l'interface (« jeudi 10 septembre 2026 »). */
export function formatCalendarDay(day: string, language: string) {
  return new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00.000Z`));
}
