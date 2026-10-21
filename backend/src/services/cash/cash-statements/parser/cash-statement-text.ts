import { StatementFormatError, isoDate, withoutAccents } from "../../dividend-statements/parser/statement-text.js";

/**
 * Lecture élémentaire du texte d'un relevé espèces tel que l'extrait `pdf-parse` (montants,
 * dates, lignes). `pdf-parse` perd les colonnes Débit / Crédit : aucun sens n'est lu ici.
 * Un élément illisible lève `StatementFormatError` : le relevé est refusé en entier.
 */

export { StatementFormatError, isoDate, withoutAccents };

export const DATE_SOURCE = String.raw`\d{2}\/\d{2}\/\d{4}`;
/** Ancien format : milliers séparés par une espace (« 1 000,00 »). */
const legacyGroupedAmount = /^\d{3},\d{2}$/;
const legacySimpleAmount = /^\d{1,3},\d{2}$/;
/** Nouveau format : milliers séparés par un point (« 2.000,00 »), sans ambiguïté. */
export const CURRENT_AMOUNT_SOURCE = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`;

/** Nombre maximal de groupes de milliers envisagés pour un montant de l'ancien format. */
const MAX_LEGACY_AMOUNT_GROUPS = 4;

const months: Readonly<Record<string, number>> = {
  JANVIER: 1, FEVRIER: 2, MARS: 3, AVRIL: 4, MAI: 5, JUIN: 6,
  JUILLET: 7, AOUT: 8, SEPTEMBRE: 9, OCTOBRE: 10, NOVEMBRE: 11, DECEMBRE: 12
};

/** Montant français, milliers séparés par une espace ou un point, en centimes. */
export function cashAmountCents(token: string) {
  const [units = "", decimals = ""] = token.replace(/[\s.]/g, "").split(",");
  return Number(units) * 100 + Number(decimals);
}

/** Lignes du texte, espaces et tabulations normalisés en une seule espace. */
export function statementLines(text: string) {
  return text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** Mois d'un en-tête « RELEVE COMPTE ESPECES : JUILLET 2021 », au format `AAAA-MM`. */
export function legacyPeriod(line: string) {
  const match = /^RELEVE COMPTE ESPECES : ([A-Z]+) (\d{4})$/.exec(withoutAccents(line).toUpperCase());
  if (!match?.[1] || !match[2]) return undefined;
  const month = months[match[1]];
  return month ? `${match[2]}-${String(month).padStart(2, "0")}` : undefined;
}

/** Mois `AAAA-MM` d'une date `AAAA-MM-JJ`. */
export function periodOf(isoDay: string) {
  return isoDay.slice(0, 7);
}

/**
 * Date d'échéance « JJ/MM » d'un coupon : même année que l'écriture, ou l'année précédente si le
 * mois est postérieur (coupon de décembre écrit en janvier).
 */
export function couponDate(dayMonth: string, operationDate: string) {
  const [day = "", month = ""] = dayMonth.split("/");
  const year = Number(operationDate.slice(0, 4));
  const sameYear = `${day}/${month}/${String(year)}`;
  const candidate = isoDate(sameYear);
  return candidate > operationDate ? isoDate(`${day}/${month}/${String(year - 1)}`) : candidate;
}

export interface AmountReading {
  /** Montant non signé, en centimes. */
  cents: number;
  /** Texte qui précède le montant. */
  body: string;
}

/**
 * Lectures possibles d'une fin de ligne de l'ancien format : « … 1 234,56 » peut être 1 234,56 €
 * ou 234,56 € précédé de « 1 ». Toutes sont renvoyées ; le bouclage du solde tranche.
 */
export function legacyAmountReadings(text: string): AmountReading[] {
  const tokens = text.split(" ");
  const readings: AmountReading[] = [];
  for (let groups = 1; groups <= Math.min(MAX_LEGACY_AMOUNT_GROUPS, tokens.length - 1); groups += 1) {
    const amountTokens = tokens.slice(tokens.length - groups);
    const [first, ...others] = amountTokens;
    const last = amountTokens.at(-1) ?? "";
    const valid = groups === 1
      ? legacySimpleAmount.test(last)
      : /^\d{1,3}$/.test(first ?? "") && legacyGroupedAmount.test(last) && others.slice(0, -1).every((token) => /^\d{3}$/.test(token));
    if (!valid) continue;
    readings.push({ cents: cashAmountCents(amountTokens.join(" ")), body: tokens.slice(0, tokens.length - groups).join(" ") });
  }
  return readings;
}
