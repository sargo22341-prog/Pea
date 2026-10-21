import { getZonedDateParts } from "./date-time.service.js";

const msPerMinute = 60_000;
/** Date-heure sans fuseau : `AAAA-MM-JJTHH:MM`, secondes et millisecondes facultatives. */
const wallClockPattern = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?$/;
/** Date seule : JavaScript la lit comme minuit UTC, interprétation conservée telle quelle. */
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
/** Suffixe de fuseau explicite (`Z`, `+02:00`, `+0200`). */
const explicitZonePattern = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Décalage (en minutes) du fuseau à un instant donné : heure murale - UTC. */
function offsetMinutesAt(utcMs: number, timeZone: string) {
  const parts = getZonedDateParts(new Date(utcMs), timeZone);
  const wallMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Math.round((wallMs - Math.floor(utcMs / msPerMinute) * msPerMinute) / msPerMinute);
}

/**
 * Instant UTC d'une heure murale du fuseau donné, heure d'été comprise. Deux passes : le décalage
 * est relu à l'instant obtenu, ce qui corrige les heures proches d'un changement d'heure.
 */
function wallClockToUtcMs(wallMs: number, timeZone: string) {
  const first = wallMs - offsetMinutesAt(wallMs, timeZone) * msPerMinute;
  return wallMs - offsetMinutesAt(first, timeZone) * msPerMinute;
}

/**
 * Normalise une date d'opération en ISO UTC (`toISOString`). Une date-heure sans fuseau (avis
 * d'opéré, ancienne saisie) est une heure murale du fuseau de l'application ; une date avec fuseau
 * et une date seule gardent l'instant que leur donne JavaScript. Valeur illisible : `undefined`.
 */
export function toUtcIso(value: string, timeZone: string) {
  const trimmed = value.trim();
  const match = wallClockPattern.exec(trimmed);
  if (match) {
    const [year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] = match.slice(1, 7).map((part) => Number(part) || 0);
    const milli = Number((match[7] ?? "").padEnd(3, "0"));
    const wallMs = Date.UTC(year, month - 1, day, hour, minute, second, milli);
    // Date.UTC reporte les dépassements (13e mois, 25 h) : une composante hors plage est illisible.
    const wall = new Date(wallMs);
    if (wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== day || wall.getUTCHours() !== hour || wall.getUTCMinutes() !== minute || wall.getUTCSeconds() !== second) return undefined;
    const utcMs = wallClockToUtcMs(wallMs, timeZone);
    return Number.isFinite(utcMs) ? new Date(utcMs).toISOString() : undefined;
  }
  if (!explicitZonePattern.test(trimmed) && !dateOnlyPattern.test(trimmed)) return undefined;
  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
