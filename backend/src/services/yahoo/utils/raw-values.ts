/**
 * Lecture tolérante des valeurs brutes Yahoo.
 *
 * Selon le module et l'ancienneté du cache, un nombre peut arriver nu, sous la forme historique
 * `{ raw, fmt }` ou comme chaîne ; une date peut être un `Date`, une chaîne ISO (après passage par
 * le cache JSON) ou un timestamp Unix en secondes.
 */

function unwrapRaw(value: unknown): unknown {
  return value && typeof value === "object" && "raw" in value ? (value as { raw?: unknown }).raw : value;
}

export function rawNumber(value: unknown): number | undefined {
  const candidate = unwrapRaw(value);
  if (candidate === null || candidate === undefined || candidate === "" || typeof candidate === "boolean") return undefined;
  const numberValue = Number(candidate);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

/** Nombre dont zéro signifie « non renseigné » chez Yahoo (marges des banques, rendements d'ETF...). */
export function rawNonZeroNumber(value: unknown): number | undefined {
  const numberValue = rawNumber(value);
  return numberValue === 0 ? undefined : numberValue;
}

export function rawString(value: unknown): string | undefined {
  const candidate = value && typeof value === "object" && "fmt" in value ? (value as { fmt?: unknown }).fmt : value;
  if (typeof candidate !== "string") return undefined;
  const trimmed = candidate.trim();
  return trimmed || undefined;
}

export function rawDate(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  const candidate = unwrapRaw(value);
  if (typeof candidate === "number" && Number.isFinite(candidate)) return new Date(candidate * 1000).toISOString();
  if (typeof candidate === "string") {
    const time = new Date(candidate).getTime();
    return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
  }
  return undefined;
}

/** Première date d'une valeur qui peut être une liste de dates (ex. `earningsDate`) ou une date seule. */
export function firstRawDate(value: unknown): string | undefined {
  return rawDate(Array.isArray(value) ? value[0] : value);
}
