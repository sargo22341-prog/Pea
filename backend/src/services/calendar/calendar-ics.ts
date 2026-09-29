import { calendarEventDay, nextCalendarDay, type AppLanguage, type CalendarEvent, type CalendarEventType } from "@pea/shared";

/** Longueur maximale d'une ligne iCalendar (RFC 5545 §3.1), en octets hors fin de ligne. */
const ICS_LINE_MAX_OCTETS = 75;
const ICS_PRODUCT_ID = "-//PEA Portfolio//Calendrier//FR";

const EVENT_LABELS: Record<AppLanguage, Record<CalendarEventType, string>> = {
  fr: { earnings: "Résultats", earnings_call: "Conférence résultats", ex_dividend: "Détachement du dividende", dividend: "Versement du dividende" },
  en: { earnings: "Earnings", earnings_call: "Earnings call", ex_dividend: "Ex-dividend date", dividend: "Dividend payment" }
};

const DESCRIPTION_LABELS: Record<AppLanguage, { estimatedDate: string; eps: string; revenue: string; expected: string }> = {
  fr: { estimatedDate: "Date estimée", eps: "BPA attendu", revenue: "CA attendu", expected: "Montant attendu" },
  en: { estimatedDate: "Estimated date", eps: "Expected EPS", revenue: "Expected revenue", expected: "Expected amount" }
};

/** Échappe un texte iCalendar (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Replie une ligne trop longue sur plusieurs lignes commençant par une espace, sans couper un caractère. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = "";
  let currentOctets = 0;
  for (const char of line) {
    const octets = encoder.encode(char).length;
    const limit = chunks.length === 0 ? ICS_LINE_MAX_OCTETS : ICS_LINE_MAX_OCTETS - 1;
    if (currentOctets + octets > limit) {
      chunks.push(current);
      current = "";
      currentOctets = 0;
    }
    current += char;
    currentOctets += octets;
  }
  chunks.push(current);
  return chunks.join("\r\n ");
}

function icsDate(day: string) {
  return day.replace(/-/g, "");
}

function icsTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function formatAmount(value: number, currency: string | undefined, language: AppLanguage) {
  const locale = language === "fr" ? "fr-FR" : "en-US";
  return currency
    ? new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(value)
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function eventDescription(event: CalendarEvent, language: AppLanguage) {
  const labels = DESCRIPTION_LABELS[language];
  const lines = [event.isEstimate ? labels.estimatedDate : undefined];
  if (event.epsAverage !== undefined) lines.push(`${labels.eps} : ${formatAmount(event.epsAverage, event.currency, language)}`);
  if (event.revenueAverage !== undefined) lines.push(`${labels.revenue} : ${formatAmount(event.revenueAverage, event.currency, language)}`);
  if (event.expectedDividend) lines.push(`${labels.expected} : ${formatAmount(event.expectedDividend.amount, event.expectedDividend.currency, language)}`);
  return lines.filter((line): line is string => line !== undefined).join("\n");
}

function eventLines(event: CalendarEvent, options: IcsOptions): string[] {
  const day = calendarEventDay(event.eventDate, options.timeZone);
  if (!day) return [];
  const summary = `${EVENT_LABELS[options.language][event.eventType]} - ${event.assetName} (${event.symbol})`;
  const description = eventDescription(event, options.language);
  return [
    "BEGIN:VEVENT",
    `UID:${event.eventType}-${event.id}@pea-portfolio`,
    `DTSTAMP:${icsTimestamp(options.now)}`,
    `DTSTART;VALUE=DATE:${icsDate(day)}`,
    `DTEND;VALUE=DATE:${icsDate(nextCalendarDay(day))}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    ...(description ? [`DESCRIPTION:${escapeIcsText(description)}`] : []),
    "TRANSP:TRANSPARENT",
    "END:VEVENT"
  ];
}

export interface IcsOptions {
  language: AppLanguage;
  timeZone: string;
  now: Date;
}

/** Calendrier iCalendar d'évènements d'une journée entière, lignes CRLF repliées à 75 octets. */
export function buildCalendarIcs(events: readonly CalendarEvent[], options: IcsOptions): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${ICS_PRODUCT_ID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events.flatMap((event) => eventLines(event, options)),
    "END:VCALENDAR"
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
