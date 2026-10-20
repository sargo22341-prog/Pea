import { AMOUNT_SOURCE, DATE_SOURCE, ISIN_SOURCE, StatementFormatError, amountList, withoutAccents } from "./statement-text.js";

/**
 * Découpage du texte en sections (coupons, remboursements) et reconstitution des lignes. Une
 * ligne commence par sa date ; la quantité peut être sur une ligne à part, avant ou après le nom.
 * Toute ligne chiffrée qui ne trouve pas sa place refuse le relevé.
 */

export type SectionKind = "coupons" | "refunds";

export interface StatementSection {
  kind: SectionKind;
  rows: string[];
  /** Montants de la ligne TOTAL, absente si la section continue sur le feuillet suivant. */
  total?: number[] | undefined;
}

const datePrefix = new RegExp(`^${DATE_SOURCE}(?:\\s|$)`);
const isinAnywhere = new RegExp(`\\(${ISIN_SOURCE}\\)`);
const amountAnywhere = new RegExp(AMOUNT_SOURCE);

function sectionStart(line: string): SectionKind | undefined {
  const normalized = withoutAccents(line).toUpperCase();
  if (normalized === "DETAIL COUPONS") return "coupons";
  if (normalized === "DETAIL REMBOURSEMENTS") return "refunds";
  return undefined;
}

function isSectionEnd(line: string) {
  return /^Feuillet \d+\/\d+$/.test(line) || /^(COUPONS|REMBOURSEMENTS) : /.test(withoutAccents(line).toUpperCase());
}

/** Morceau de ligne : quantité seule, montants seuls, ou nom avec ISIN. */
function isRowMaterial(line: string) {
  return /^\d+$/.test(line) || isinAnywhere.test(line) || amountList(line) !== undefined;
}

/** Sections du relevé, dans l'ordre du texte. */
export function readSections(lines: readonly string[]): StatementSection[] {
  const sections: StatementSection[] = [];
  let current: StatementSection | undefined;
  let row: string[] | undefined;
  const closeRow = () => {
    if (current && row) current.rows.push(row.join(" "));
    row = undefined;
  };
  const closeSection = () => {
    closeRow();
    current = undefined;
  };

  for (const line of lines) {
    const kind = sectionStart(line);
    if (kind) {
      closeSection();
      current = { kind, rows: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    if (isSectionEnd(line)) {
      closeSection();
      continue;
    }
    if (line.startsWith("TOTAL EUR")) {
      closeRow();
      const total = amountList(line.slice("TOTAL EUR".length));
      if (!total) throw new StatementFormatError("Ligne TOTAL du relevé illisible.");
      current.total = total;
      current = undefined;
      continue;
    }
    if (datePrefix.test(line)) {
      closeRow();
      row = [line];
    } else if (isRowMaterial(line)) {
      if (!row) throw new StatementFormatError("Mise en page du relevé non reconnue : des montants précèdent la première ligne.");
      row.push(line);
    } else if (/\d/.test(line) && (amountAnywhere.test(line) || isinAnywhere.test(line))) {
      throw new StatementFormatError("Mise en page du relevé non reconnue.");
    } else {
      // Libellé fiscal (« revenus d'actions… ») ou en-tête de colonne : la ligne en cours est complète.
      closeRow();
    }
  }
  closeSection();
  return sections;
}

export interface CouponRowText {
  date: string;
  quantity?: number | undefined;
  name: string;
  isin: string;
  amounts: number[];
}

const couponRow = new RegExp(`^(${DATE_SOURCE})(?: (\\d+))? (.+?) ?\\((${ISIN_SOURCE})\\)((?: ${AMOUNT_SOURCE})+)(?: (\\d+))?$`);

/** Ligne de coupon reconstituée : date, quantité, nom, ISIN et montants (au moins 3). */
export function parseCouponRow(text: string, index: number): CouponRowText {
  const match = couponRow.exec(text);
  const amounts = match?.[5] ? amountList(match[5]) : undefined;
  if (!match?.[1] || !match[3] || !match[4] || !amounts || amounts.length < 3 || amounts.length > 6 || (match[2] && match[6])) {
    throw new StatementFormatError(`Ligne ${index + 1} du relevé illisible : date, valeur, ISIN ou montants manquants.`);
  }
  const quantity = match[2] ?? match[6];
  return { date: match[1], quantity: quantity === undefined ? undefined : Number(quantity), name: match[3].trim(), isin: match[4], amounts };
}

const refundRow = new RegExp(`^(${DATE_SOURCE}) (.+?) ?\\((${ISIN_SOURCE})\\).* (${AMOUNT_SOURCE})$`);

/** Remboursement : seul le net client (dernier montant) est retenu, pour être signalé. */
export function parseRefundRow(text: string) {
  const match = refundRow.exec(text);
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) return undefined;
  const amount = amountList(match[4]);
  return { date: match[1], name: match[2].trim(), isin: match[3], amountCents: amount?.[0] ?? 0 };
}
