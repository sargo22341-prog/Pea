/**
 * Jour civil (`YYYY-MM-DD`) d'un évènement du calendrier. Une date sans heure est stockée à minuit
 * UTC : on garde ce jour tel quel, sinon un fuseau à l'ouest de Greenwich l'afficherait la veille.
 * Une date avec heure est rapportée au fuseau de l'application.
 */
export function calendarEventDay(eventDate: string, timeZone: string): string | undefined {
  const date = new Date(eventDate);
  if (Number.isNaN(date.getTime())) return undefined;
  const isDateOnly = date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;
  if (isDateOnly) return date.toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Jour civil suivant d'une date `YYYY-MM-DD` (borne exclusive d'une plage). */
export function nextCalendarDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
