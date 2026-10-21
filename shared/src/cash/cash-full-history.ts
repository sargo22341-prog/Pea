/**
 * Passage en historique complet : quand les relevés espèces couvrent tout depuis l'ouverture du
 * PEA, l'état initial est remplacé par les opérations réelles (versements datés, dividendes
 * d'avant la date de départ devenus de vrais mouvements) et le rendement annualisé devient
 * calculable. Action explicite, confirmée, atomique et tracée.
 */

/**
 * Raison qui empêche le passage :
 * - `not_ready` : compte espèces non configuré ;
 * - `already_full` : aucun état initial, l'historique est déjà complet ;
 * - `no_statements` : aucun relevé espèces importé ;
 * - `first_statement_not_opening` : le premier relevé ne part pas de 0 € avec un virement (ouverture) ;
 * - `continuity_break` : un relevé ne reprend pas le nouveau solde du précédent (relevé manquant) ;
 * - `not_covered` : les relevés importés s'arrêtent avant la date de départ ;
 * - `missing_trade_notices` : achat ou vente du relevé, avant la date de départ, sans opération ;
 * - `missing_coupon_statements` : coupon du relevé, avant la date de départ, sans dividende certifié ;
 * - `unmatched_entries` : opération de l'application, avant la date de départ, absente des relevés ;
 * - `unmatched_coupon_lines` : dividende certifié par un relevé de coupons absent des relevés espèces ;
 * - `coupon_without_position` : dividende certifié dont l'ISIN ne désigne aucune position unique.
 */
export const FULL_HISTORY_BLOCKERS = [
  "not_ready",
  "already_full",
  "no_statements",
  "first_statement_not_opening",
  "continuity_break",
  "not_covered",
  "missing_trade_notices",
  "missing_coupon_statements",
  "unmatched_entries",
  "unmatched_coupon_lines",
  "coupon_without_position"
] as const;
export type FullHistoryBlockerCode = (typeof FULL_HISTORY_BLOCKERS)[number];

/** Code d'erreur `409` d'un passage refusé (`details.blockers`). */
export const FULL_HISTORY_INELIGIBLE_CODE = "FULL_HISTORY_INELIGIBLE";
/** Code d'erreur `409` d'un passage annulé : un mois ne boucle plus après conversion (`details.periods`). */
export const FULL_HISTORY_MISMATCH_CODE = "FULL_HISTORY_MISMATCH";

export interface FullHistoryBlocker {
  code: FullHistoryBlockerCode;
  count: number;
  /**
   * Premiers éléments concernés, sans donnée personnelle : mois (`2026-03`), lignes de relevé
   * (`2026-03#4`) ou opérations de l'application (`transaction:12`, `movement:3`).
   */
  references: string[];
}

/** Mouvements créés depuis les lignes des relevés espèces antérieures à la date de départ. */
export interface FullHistoryCreation {
  kind: "deposit" | "withdrawal" | "fee" | "capital_repayment" | "compensation";
  count: number;
  /** Total en euros (valeur absolue). */
  amount: number;
}

/** Indicateurs du compte, avant et après le passage. */
export interface FullHistoryTotals {
  cash: number;
  deposits: number;
  withdrawals: number;
  cashDividends: number;
  otherCredits: number;
}

export interface FullHistoryPreview {
  eligible: boolean;
  blockers: FullHistoryBlocker[];
  referenceAt?: string | undefined;
  /** Premier et dernier mois des relevés espèces importés. */
  firstPeriod?: string | undefined;
  lastPeriod?: string | undefined;
  statements: number;
  creations: FullHistoryCreation[];
  /** Dividendes certifiés par relevé de coupons qui deviennent de vrais mouvements. */
  dividends: { count: number; amount: number };
  before: FullHistoryTotals;
  /** Indicateurs après passage (seulement si le passage est possible). */
  after?: FullHistoryTotals | undefined;
  /** Premier instant où le solde rejoué passerait sous zéro (opération écrite avant son financement). */
  negativeBalanceAt?: string | undefined;
}
