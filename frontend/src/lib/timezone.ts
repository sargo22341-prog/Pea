/**
 * Role du fichier : fournir les helpers frontend de timezone. Les timestamps
 * recus de l'API restent UTC; la timezone sert uniquement au formatage ou a la
 * projection des horaires locaux de marche sur l'axe du chart.
 */

export const FALLBACK_TIMEZONE = "Europe/Paris";

/** Garantit une timezone IANA utilisable par Intl.DateTimeFormat. */
export function normalizeTimeZone(timeZone?: string) {
  const candidate = timeZone?.trim() || FALLBACK_TIMEZONE;
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/** Lit la date civile d'un instant UTC dans une timezone explicite. */
export function localIsoDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

/** Convertit `YYYY-MM-DD` + `HH:mm` local en instant UTC pour les domaines Recharts. */
export function zonedTimeToUtc(day: string, time: string, timeZone: string) {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date, hour, minute));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
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

/** Formate la plage horaire locale d'une session marche. */
export function formatMarketSessionHours(open: string, close: string) {
  return `${open}-${close}`;
}
