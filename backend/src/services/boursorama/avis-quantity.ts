import { normalizeFrenchNumber } from "./avis-numbers.js";

/** Séparateurs de milliers rencontrés dans les avis : espace, espace insécable et espace fine. */
const thousandsSeparator = "[   ]";
const quantityLinePattern = new RegExp(
  String.raw`(?:\d{2}:\d{2}:\d{2}\s*\n\s*)?(\d{1,3}(?:${thousandsSeparator}\d{3})*(?:[,.]\d+)?|\d+(?:[,.]\d+)?)\s+([^\n]+?)\s+R[ée]f[ée]rence\s*:`,
  "i"
);

/** Tolérance d'arrondi entre quantité × cours et le montant brut imprimé. */
const grossAmountTolerance = 0.05;

export interface QuantityCheck {
  executedPrice?: number | undefined;
  grossAmount?: number | undefined;
}

function matchesGross(quantity: number | undefined, { executedPrice, grossAmount }: QuantityCheck) {
  if (quantity === undefined || executedPrice === undefined || grossAmount === undefined) return false;
  return Math.abs(quantity * executedPrice - grossAmount) <= grossAmountTolerance;
}

/**
 * Extrait la quantité exécutée et le nom de la valeur depuis le texte d'un avis d'opéré.
 *
 * Les quantités à partir de 1 000 sont imprimées avec un séparateur de milliers (`1 916`) : le
 * groupe de trois chiffres appartient à la quantité, pas au nom de la valeur. Lorsqu'un nom de
 * valeur commence lui-même par trois chiffres, le montant brut (quantité × cours) départage les
 * deux lectures possibles.
 */
export function extractQuantity(text: string, check: QuantityCheck = {}) {
  const match = quantityLinePattern.exec(text);
  if (!match?.[1] || !match[2]) return { quantity: undefined, assetName: undefined };

  const grouped = { quantity: normalizeFrenchNumber(match[1]), assetName: match[2] };
  const [firstGroup = "", ...otherGroups] = match[1].split(new RegExp(thousandsSeparator));
  const ungrouped = { quantity: normalizeFrenchNumber(firstGroup), assetName: `${otherGroups.join(" ")} ${match[2]}` };
  const chosen = otherGroups.length > 0 && matchesGross(ungrouped.quantity, check) && !matchesGross(grouped.quantity, check)
    ? ungrouped
    : grouped;

  return { quantity: chosen.quantity, assetName: chosen.assetName.replace(/\s+/g, " ").trim() };
}
