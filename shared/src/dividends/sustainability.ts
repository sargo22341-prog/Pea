import type { HealthRating } from "../fundamentals/health.js";
import type { FinancialStatementRow } from "../fundamentals/statements.js";

/**
 * Soutenabilité du dividende : seuils partagés par le backend et le frontend (jauges, pastilles,
 * explications). Un taux de distribution bas laisse de la marge pour maintenir le dividende.
 */

/** Taux de distribution (dividendes / bénéfice) jusqu'auquel le dividende est jugé confortable. */
export const PAYOUT_RATIO_GOOD_MAX = 0.6;
/** Au-delà, l'entreprise distribue presque tout son bénéfice (ou plus) : dividende fragile. */
export const PAYOUT_RATIO_WEAK_ABOVE = 0.9;
/** Couverture des dividendes versés par le flux de trésorerie disponible jugée confortable. */
export const FCF_COVERAGE_GOOD = 1.5;
/** En dessous, le dividende n'est pas financé par le flux de trésorerie disponible. */
export const FCF_COVERAGE_WEAK = 1;

/** Note du taux de distribution ; un taux négatif (dividende versé malgré une perte) est fragile. */
export function ratePayoutRatio(value: number | undefined): HealthRating | undefined {
  if (value === undefined || !Number.isFinite(value) || value === 0) return undefined;
  if (value < 0 || value > PAYOUT_RATIO_WEAK_ABOVE) return "weak";
  return value <= PAYOUT_RATIO_GOOD_MAX ? "good" : "fair";
}

export interface FreeCashFlowCoverage {
  /** Flux de trésorerie disponible divisé par les dividendes versés. */
  coverage: number;
  /** Clôture de l'exercice utilisé. */
  endDate: string;
}

/** Couverture du dernier exercice annuel publié (la ligne « 12 mois glissants » est ignorée). */
export function freeCashFlowCoverage(rows: readonly FinancialStatementRow[]): FreeCashFlowCoverage | undefined {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!row || row.isTtm || row.freeCashFlow === undefined || row.dividendsPaid === undefined || row.dividendsPaid <= 0) continue;
    return { coverage: row.freeCashFlow / row.dividendsPaid, endDate: row.endDate };
  }
  return undefined;
}

export function rateFreeCashFlowCoverage(value: number | undefined): HealthRating | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  if (value >= FCF_COVERAGE_GOOD) return "good";
  return value < FCF_COVERAGE_WEAK ? "weak" : "fair";
}
