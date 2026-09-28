import { numberFormatter } from "./format";

/** Valeur affichée quand un indicateur est absent. */
export const MISSING_VALUE = "n/a";

function isNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

/** Fraction (0,153) affichée en pourcentage (15,3 %), signée si demandé. */
export function formatFractionPercent(value: number | undefined, options: { signed?: boolean; digits?: number } = {}) {
  if (!isNumber(value)) return MISSING_VALUE;
  const formatted = numberFormatter({ maximumFractionDigits: options.digits ?? 1, minimumFractionDigits: options.digits ?? 1 }).format(value * 100);
  return `${options.signed && value > 0 ? "+" : ""}${formatted} %`;
}

/** Multiple ou ratio (PER, P/B, bêta...) avec deux décimales au plus. */
export function formatRatio(value: number | undefined, digits = 2) {
  if (!isNumber(value)) return MISSING_VALUE;
  return numberFormatter({ maximumFractionDigits: digits }).format(value);
}

/** Montant compact (12,3 Md €) pour les capitalisations, trésoreries et dettes. */
export function formatCompactMoney(value: number | undefined, currency = "EUR") {
  if (!isNumber(value)) return MISSING_VALUE;
  return numberFormatter({ notation: "compact", maximumFractionDigits: 1, style: "currency", currency }).format(value);
}

/** Nombre compact sans devise (241,7 M) pour les quantités de titres. */
export function formatCompactNumber(value: number | undefined) {
  if (!isNumber(value)) return MISSING_VALUE;
  return numberFormatter({ notation: "compact", maximumFractionDigits: 1 }).format(value);
}
