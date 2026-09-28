import { splitDecisionsRepository } from "../../../repositories/portfolio/split-decisions.repository.js";
import { adjustTransactionsForSplits, type AppliedSplit, type SplitAdjustableTransaction } from "./split-adjustment.js";

/** Divisions validées par le propriétaire de chaque position, en une seule requête. */
export function appliedSplitsByPosition(positionIds: number[]): Map<number, AppliedSplit[]> {
  const byPosition = new Map<number, AppliedSplit[]>();
  for (const row of splitDecisionsRepository.appliedForPositions(positionIds)) {
    const splits = byPosition.get(row.position_id) ?? [];
    splits.push({ date: row.split_date, numerator: row.numerator, denominator: row.denominator });
    byPosition.set(row.position_id, splits);
  }
  return byPosition;
}

/** Transactions d'une position telles qu'elles doivent être lues après les divisions validées. */
export function splitAdjustedTransactions<T extends SplitAdjustableTransaction>(positionId: number, rows: T[]) {
  return adjustTransactionsForSplits(rows, appliedSplitsByPosition([positionId]).get(positionId) ?? []);
}
