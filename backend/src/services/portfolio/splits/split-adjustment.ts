/**
 * Ajustement des transactions aux divisions d'actions, appliqué à la lecture.
 *
 * Après une division 1 → 10, Yahoo renvoie des cours divisés par dix et des historiques ajustés :
 * une transaction antérieure doit être lue avec dix fois plus de titres à un prix dix fois
 * moindre. Le montant (quantité × prix) et les frais restent inchangés, et la ligne stockée
 * n'est jamais modifiée.
 */

export interface AppliedSplit {
  /** Jour de la division (AAAA-MM-JJ, UTC) : seules les transactions antérieures à ce jour sont ajustées. */
  date: string;
  numerator: number;
  denominator: number;
}

export interface SplitAdjustableTransaction {
  quantity: number;
  price: number;
  traded_at: string;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Début du jour de la division en UTC ; `undefined` si la date est illisible. */
export function splitStartTime(split: Pick<AppliedSplit, "date">) {
  if (!DAY_PATTERN.test(split.date)) return undefined;
  const time = Date.parse(`${split.date}T00:00:00.000Z`);
  return Number.isFinite(time) ? time : undefined;
}

export function splitRatio(split: Pick<AppliedSplit, "numerator" | "denominator">) {
  return split.denominator > 0 && split.numerator > 0 ? split.numerator / split.denominator : 1;
}

/** Une transaction est ajustée si elle est exécutée strictement avant le jour de la division. */
export function isBeforeSplit(tradedAt: string, split: Pick<AppliedSplit, "date">) {
  const tradedTime = new Date(tradedAt).getTime();
  const splitTime = splitStartTime(split);
  return Number.isFinite(tradedTime) && splitTime !== undefined && tradedTime < splitTime;
}

/** Facteur cumulé des divisions postérieures à la transaction (1 si aucune). */
export function splitFactorAt(tradedAt: string, splits: AppliedSplit[]) {
  return splits.reduce((factor, split) => (isBeforeSplit(tradedAt, split) ? factor * splitRatio(split) : factor), 1);
}

/**
 * Retourne des copies ajustées des transactions (quantité × facteur, prix ÷ facteur) avec leur
 * `splitFactor`. Les transactions non concernées sont renvoyées telles quelles.
 */
export function adjustTransactionsForSplits<T extends SplitAdjustableTransaction>(rows: T[], splits: AppliedSplit[]): (T & { splitFactor?: number })[] {
  if (!splits.length) return rows;
  return rows.map((row) => {
    const factor = splitFactorAt(row.traded_at, splits);
    if (factor === 1) return row;
    return { ...row, quantity: row.quantity * factor, price: row.price / factor, splitFactor: factor };
  });
}
