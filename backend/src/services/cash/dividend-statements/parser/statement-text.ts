/**
 * Lecture élémentaire du texte d'un relevé de coupons (montants, dates, mois) tel que l'extrait
 * `pdf-parse`. Aucune valeur n'est devinée : un élément illisible lève `StatementFormatError`.
 */

/** Relevé illisible ou incohérent : il est refusé en entier, sans importation partielle. */
export class StatementFormatError extends Error {}

/** Montant français : « 1 234,56 ». Les espaces insécables sont normalisés par `textLines`. */
export const AMOUNT_SOURCE = String.raw`\d{1,3}(?: \d{3})*,\d{2}`;
export const ISIN_SOURCE = String.raw`[A-Z]{2}[A-Z0-9]{9}\d`;
export const DATE_SOURCE = String.raw`\d{2}\/\d{2}\/\d{4}`;

const amountToken = new RegExp(String.raw`\s*(${AMOUNT_SOURCE})(?=\s|$)`, "y");

const months: Readonly<Record<string, number>> = {
  JANVIER: 1, FEVRIER: 2, MARS: 3, AVRIL: 4, MAI: 5, JUIN: 6,
  JUILLET: 7, AOUT: 8, SEPTEMBRE: 9, OCTOBRE: 10, NOVEMBRE: 11, DECEMBRE: 12
};

export function withoutAccents(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function amountCents(token: string) {
  const [units = "", decimals = ""] = token.replace(/\s/g, "").split(",");
  return Number(units) * 100 + Number(decimals);
}

/**
 * Montants d'un texte qui n'en contient que, séparés par des espaces. `undefined` si un élément
 * n'est pas un montant : la ligne n'a pas la forme attendue.
 */
export function amountList(text: string): number[] | undefined {
  const values: number[] = [];
  amountToken.lastIndex = 0;
  const trimmed = text.trim();
  while (amountToken.lastIndex < trimmed.length) {
    const match = amountToken.exec(trimmed);
    if (!match?.[1]) return undefined;
    values.push(amountCents(match[1]));
  }
  return values;
}

/** `JJ/MM/AAAA` vers `AAAA-MM-JJ`, après contrôle du calendrier. */
export function isoDate(frenchDate: string) {
  const [day, month, year] = frenchDate.split("/").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== day || date.getUTCMonth() + 1 !== month) {
    throw new StatementFormatError(`Date illisible sur le relevé : ${frenchDate}.`);
  }
  return date.toISOString().slice(0, 10);
}

/** Mois d'un en-tête « COUPONS REMBOURSEMENTS : MAI 2024 », au format `AAAA-MM`. */
export function statementPeriod(line: string) {
  const match = /^COUPONS REMBOURSEMENTS : ([A-Z]+) (\d{4})$/.exec(withoutAccents(line).toUpperCase());
  if (!match?.[1] || !match[2]) return undefined;
  const month = months[match[1]];
  return month ? `${match[2]}-${String(month).padStart(2, "0")}` : undefined;
}

/** Lignes du texte, espaces normalisés. Une tabulation de `pdf-parse` sépare deux cellules. */
export function textLines(text: string) {
  return text.split(/\r?\n|\t/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}
