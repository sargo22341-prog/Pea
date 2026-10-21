import type { CashStatementLineKind } from "@pea/shared";
import type { RawStatement, RowReading } from "./cash-statement-rows.js";
import { StatementFormatError } from "./cash-statement-text.js";

/**
 * Sens des montants : `pdf-parse` perd les colonnes Débit / Crédit. Le libellé donne le sens
 * quand il est sans équivoque ; sinon toutes les attributions sont essayées et seule l'unique
 * attribution qui fait boucler le solde (ancien solde + lignes = nouveau solde, au centime) est
 * acceptée. Aucune ou plusieurs : le relevé est refusé.
 */

/** Au-delà, la lecture est trop ambiguë pour être départagée par le seul solde. */
export const MAX_SIGN_COMBINATIONS = 4096;

export interface ResolvedRow {
  reading: RowReading;
  kind: CashStatementLineKind;
  /** Montant signé en centimes (positif = crédit). */
  amountCents: number;
}

function options(reading: RowReading): ResolvedRow[] {
  const result: ResolvedRow[] = [];
  if (reading.label.credit) result.push({ reading, kind: reading.label.credit, amountCents: reading.amountCents });
  if (reading.label.debit) result.push({ reading, kind: reading.label.debit, amountCents: -reading.amountCents });
  return result;
}

function solve(statement: RawStatement, choices: readonly ResolvedRow[][]) {
  const combinations = choices.reduce((product, rowOptions) => product * Math.max(1, rowOptions.length), 1);
  if (combinations > MAX_SIGN_COMBINATIONS) throw new StatementFormatError("Relevé illisible : lecture des montants trop ambiguë.");
  const target = statement.closingCents - statement.openingCents;
  const solutions: ResolvedRow[][] = [];
  const explore = (index: number, sum: number, chosen: ResolvedRow[]) => {
    if (solutions.length > 1) return;
    const rowOptions = choices[index];
    if (rowOptions === undefined) {
      if (sum === target) solutions.push([...chosen]);
      return;
    }
    for (const option of rowOptions) explore(index + 1, sum + option.amountCents, [...chosen, option]);
  };
  explore(0, 0, []);
  return solutions;
}

/**
 * Les montants sont d'abord lus avec leurs milliers (« 2 583,38 », lecture naturelle d'une
 * colonne de montants) ; si aucune attribution ne boucle, les autres lectures (« 583,38 » précédé
 * de « 2 ») sont essayées. Dans chaque cas, une seule attribution doit faire boucler le solde.
 */
export function resolveSigns(statement: RawStatement): ResolvedRow[] {
  const preferred = solve(statement, statement.rows.map((row) => row.readings.slice(-1).flatMap(options)));
  const solutions = preferred.length ? preferred : solve(statement, statement.rows.map((row) => row.readings.flatMap(options)));
  const [solution] = solutions;
  if (!solution) throw new StatementFormatError("Relevé incohérent : l'ancien solde et les opérations ne donnent pas le nouveau solde.");
  if (solutions.length > 1) throw new StatementFormatError("Relevé illisible : plusieurs lectures des montants font boucler le solde.");
  return solution;
}
