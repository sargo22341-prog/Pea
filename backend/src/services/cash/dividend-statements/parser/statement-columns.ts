import { StatementFormatError } from "./statement-text.js";

/**
 * Attribution des montants d'une ligne de coupon à leurs colonnes. `pdf-parse` n'écrit pas les
 * cellules vides : une ligne française affiche 3 montants (brut, net fiscal, net client), une
 * ligne étrangère 4 (avec le crédit d'impôt). Chaque attribution possible est contrôlée par
 * l'arithmétique de la ligne, puis l'ensemble par les totaux du relevé. Une attribution ambiguë
 * ou incohérente refuse le relevé : aucun montant n'est deviné.
 */

const COLUMNS = ["gross", "credit", "prepaid", "netFiscal", "commission", "net"] as const;
type Column = (typeof COLUMNS)[number];
const REQUIRED: readonly Column[] = ["gross", "netFiscal", "net"];
/** Colonnes de la ligne TOTAL : le brut n'y figure pas toujours. */
const TOTAL_COLUMNS: readonly Column[] = ["credit", "prepaid", "netFiscal", "commission", "net"];

/** Nombre maximal de combinaisons explorées avant de déclarer le relevé ambigu. */
const MAX_EXPLORED_COMBINATIONS = 100_000;

export type CouponAmounts = Record<Column, number>;

function layouts(count: number): Column[][] {
  const results: Column[][] = [];
  const visit = (start: number, chosen: Column[]) => {
    if (chosen.length === count) {
      if (REQUIRED.every((column) => chosen.includes(column))) results.push(chosen);
      return;
    }
    COLUMNS.slice(start).forEach((column, offset) => { visit(start + offset + 1, [...chosen, column]); });
  };
  visit(0, []);
  return results;
}

/** Attributions compatibles avec l'arithmétique d'une ligne : net fiscal - commission = net client. */
export function rowCandidates(values: readonly number[]): CouponAmounts[] {
  return layouts(values.length).flatMap((layout) => {
    const amounts: CouponAmounts = { gross: 0, credit: 0, prepaid: 0, netFiscal: 0, commission: 0, net: 0 };
    layout.forEach((column, index) => { amounts[column] = values[index] ?? 0; });
    const coherent = amounts.netFiscal - amounts.commission === amounts.net && amounts.netFiscal <= amounts.gross && amounts.net > 0;
    return coherent ? [amounts] : [];
  });
}

/** Totaux du relevé : 5 montants (crédit, acompte, net fiscal, commission, net) ou 6 avec le brut. */
export function totalAmounts(values: readonly number[]): Partial<CouponAmounts> {
  const columns = values.length === TOTAL_COLUMNS.length + 1 ? ["gross" as const, ...TOTAL_COLUMNS] : values.length === TOTAL_COLUMNS.length ? TOTAL_COLUMNS : undefined;
  if (!columns) throw new StatementFormatError("Ligne TOTAL du relevé illisible.");
  return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? 0]));
}

function sameAmounts(first: CouponAmounts, second: CouponAmounts) {
  return COLUMNS.every((column) => first[column] === second[column]);
}

/**
 * Choisit pour chaque ligne l'unique attribution dont les sommes égalent les totaux du relevé.
 * Plusieurs solutions qui donnent des montants différents rendent le relevé ambigu.
 */
export function resolveColumns(rows: readonly (readonly number[])[], totals: Partial<CouponAmounts>): CouponAmounts[] {
  const candidates = rows.map((values, index) => {
    const found = rowCandidates(values);
    if (!found.length) throw new StatementFormatError(`Ligne ${index + 1} du relevé incohérente : ses montants ne se recoupent pas.`);
    return found;
  });
  const checked = COLUMNS.filter((column) => totals[column] !== undefined);
  let solution: CouponAmounts[] | undefined;
  let explored = 0;
  const sums: Record<Column, number> = { gross: 0, credit: 0, prepaid: 0, netFiscal: 0, commission: 0, net: 0 };
  const chosen: CouponAmounts[] = [];

  const visit = (index: number) => {
    explored += 1;
    if (explored > MAX_EXPLORED_COMBINATIONS) throw new StatementFormatError("Relevé ambigu : les colonnes des montants ne peuvent pas être déterminées.");
    if (checked.some((column) => sums[column] > (totals[column] ?? 0))) return;
    if (index === candidates.length) {
      if (!checked.every((column) => sums[column] === totals[column])) return;
      if (solution?.some((amounts, row) => { const other = chosen[row]; return !other || !sameAmounts(amounts, other); })) {
        throw new StatementFormatError("Relevé ambigu : plusieurs lectures des montants respectent les totaux.");
      }
      solution = [...chosen];
      return;
    }
    for (const amounts of candidates[index] ?? []) {
      for (const column of COLUMNS) sums[column] += amounts[column];
      chosen.push(amounts);
      visit(index + 1);
      chosen.pop();
      for (const column of COLUMNS) sums[column] -= amounts[column];
    }
  };
  visit(0);
  if (!solution) throw new StatementFormatError("Relevé incohérent : la somme des lignes ne correspond pas aux totaux.");
  return solution;
}
