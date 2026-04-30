/**
 * Role du fichier : centraliser les conversions entre instants UTC et vues
 * locales de timezone. Les Date retournees restent des instants UTC; la
 * timezone ne sert qu'a interpreter une date civile ou une heure de marche.
 */

export interface ZonedDateParts {
  isoDate: string;
  year: number;
  month: number;
  day: number;
  weekday: string;
  hour: number;
  minute: number;
}

/**
 * Valide une timezone IANA sans stocker de date locale comme source de verite.
 */
export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Lit les composantes civiles d'un instant UTC dans une timezone donnee.
 */
export function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = Number(value("day"));
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));

  return {
    isoDate: `${value("year")}-${value("month")}-${value("day")}`,
    year,
    month,
    day,
    weekday: value("weekday"),
    hour,
    minute
  };
}

/**
 * Convertit une date civile + heure locale de marche en instant UTC.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = getZonedDateParts(utc, timeZone);
  const observedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(utc.getTime() - (observedAsUtc - utc.getTime()));
}

/**
 * Formate un instant UTC en cle de jour local pour grouper les candles.
 */
export function localDayKey(date: Date, timeZone: string) {
  return getZonedDateParts(date, timeZone).isoDate;
}

/**
 * Transforme `HH:mm` en minutes depuis minuit pour comparer des horaires locaux.
 */
export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
