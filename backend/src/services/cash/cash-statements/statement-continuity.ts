import type { CashStatementContinuity } from "@pea/shared";

/**
 * Enchaînement des relevés mensuels (règle pure) : le nouveau solde d'un mois est l'ancien solde
 * du relevé suivant. Un mois sans relevé est signalé (le courtier n'en émet pas sans opération,
 * mais un filtre d'export peut en faire oublier) ; un changement de compte part de zéro et reprend
 * le solde précédent par une ligne neutre de reprise.
 */

export interface StatementBalances {
  period: string;
  openingCents: number;
  closingCents: number;
  /** Somme des lignes de reprise de solde (changement de compte). */
  transferCents: number;
}

function monthIndex(period: string) {
  const [year = 0, month = 0] = period.split("-").map(Number);
  return year * 12 + month - 1;
}

function periodAt(index: number) {
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Mois strictement compris entre deux relevés. */
export function periodsBetween(previous: string, next: string) {
  const periods: string[] = [];
  for (let index = monthIndex(previous) + 1; index < monthIndex(next); index += 1) periods.push(periodAt(index));
  return periods;
}

export function continuityOf(statement: StatementBalances, previous: StatementBalances | undefined): CashStatementContinuity {
  if (!previous) return { status: "first" };
  const missingPeriods = periodsBetween(previous.period, statement.period);
  const base = { previousPeriod: previous.period, missingPeriods: missingPeriods.length ? missingPeriods : undefined };
  const accountChange = statement.openingCents === 0 && statement.transferCents !== 0 && statement.transferCents === previous.closingCents;
  if (accountChange) return { ...base, status: "account_change" };
  if (missingPeriods.length) return { ...base, status: "gap", balanceMatches: previous.closingCents === statement.openingCents };
  return { ...base, status: previous.closingCents === statement.openingCents ? "continuous" : "balance_break" };
}

/**
 * Continuité de chaque relevé du lot par rapport au relevé connu qui le précède (déjà importé ou
 * du même lot). Les relevés doivent avoir des mois distincts.
 */
export function batchContinuity(batch: readonly StatementBalances[], stored: readonly StatementBalances[]) {
  const known = [...stored.filter((row) => !batch.some((statement) => statement.period === row.period)), ...batch]
    .sort((a, b) => a.period.localeCompare(b.period));
  return new Map(batch.map((statement) => {
    const previous = known.filter((row) => row.period < statement.period).at(-1);
    return [statement.period, continuityOf(statement, previous)] as const;
  }));
}
