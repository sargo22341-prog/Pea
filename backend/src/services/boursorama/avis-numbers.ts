/**
 * Convertit un nombre au format français en nombre JavaScript.
 *
 * Exemple : `"1 234,56"` devient `1234.56`.
 */
export function normalizeFrenchNumber(value: string): number | undefined {
  const cleaned = value
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.\- ]/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * Convertit un montant français optionnel en nombre.
 */
export function parseFrenchMoney(value?: string): number | undefined {
  if (!value) return undefined;
  return normalizeFrenchNumber(value);
}
