import { parseIsoDateParts, parseTimeParts } from "@pea/shared";

export const FALLBACK_TIMEZONE = "Europe/Paris";

/**
 * Les graphiques appellent ces fonctions pour chaque tick et chaque point : construire un
 * `Intl.DateTimeFormat` coute bien plus cher que formater. La validation d'une timezone et les
 * formateurs sont donc memorises (le nombre de timezones utilisees reste tres faible).
 */
const resolvedTimeZones = new Map<string, string>();
const isoDateFormatters = new Map<string, Intl.DateTimeFormat>();
const dateTimePartsFormatters = new Map<string, Intl.DateTimeFormat>();

/** Garantit une timezone IANA utilisable par Intl.DateTimeFormat. */
export function normalizeTimeZone(timeZone?: string) {
  const candidate = timeZone?.trim() || FALLBACK_TIMEZONE;
  const cached = resolvedTimeZones.get(candidate);
  if (cached) return cached;
  const resolved = isSupportedTimeZone(candidate) ? candidate : FALLBACK_TIMEZONE;
  resolvedTimeZones.set(candidate, resolved);
  return resolved;
}

function isSupportedTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function cachedFormatter(cache: Map<string, Intl.DateTimeFormat>, timeZone: string, options: Intl.DateTimeFormatOptions) {
  const resolved = normalizeTimeZone(timeZone);
  let formatter = cache.get(resolved);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: resolved, ...options });
    cache.set(resolved, formatter);
  }
  return formatter;
}

/** Lit la date civile d'un instant UTC dans une timezone explicite. */
export function localIsoDate(date: Date, timeZone: string) {
  return cachedFormatter(isoDateFormatters, timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Convertit `YYYY-MM-DD` + `HH:mm` local en instant UTC pour les domaines Recharts. */
export function zonedTimeToUtc(day: string, time: string, timeZone: string) {
  const [year, month, date] = parseIsoDateParts(day);
  const [hour, minute] = parseTimeParts(time);
  const utc = new Date(Date.UTC(year, month - 1, date, hour, minute));
  const parts = cachedFormatter(dateTimePartsFormatters, timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(utc);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const observedAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(utc.getTime() - (observedAsUtc - utc.getTime()));
}

/** Formate les plages horaires d'une ou plusieurs sessions de marche. */
export function formatMarketSessionHours(sessions: { open: string; close: string }[]) {
  return sessions.map((s) => `${s.open}-${s.close}`).join(", ");
}
