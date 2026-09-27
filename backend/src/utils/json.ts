/** Lit un tableau JSON de chaines ; toute valeur absente, invalide ou non tableau donne un tableau vide. */
export function parseJsonStringArray(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}
