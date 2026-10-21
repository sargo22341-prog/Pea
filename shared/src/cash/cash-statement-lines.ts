/**
 * Relevés espèces mensuels du courtier (PDF) : le document qui fait foi pour tous les flux
 * d'argent du PEA. Il confirme les achats, ventes, dividendes, versements et autres crédits, mais
 * ne remplace ni les avis d'opéré (cours, frais, ISIN) ni les relevés de coupons.
 *
 * Un relevé n'est jamais conservé : seuls les champs extraits utiles (dates, libellé normalisé,
 * montant, quantité, nom abrégé de la valeur, mois et numéro de ligne) sont gardés. Jamais d'IBAN,
 * de nom du titulaire ni de numéro de compte.
 */

/**
 * Nature d'une ligne de relevé, déduite du libellé (et du bouclage du solde quand le sens est
 * ambigu). `balance_transfer` : reprise du solde d'un ancien compte, transfert neutre.
 */
export const CASH_STATEMENT_LINE_KINDS = ["deposit", "withdrawal", "buy", "sell", "dividend", "capital_repayment", "compensation", "fee", "balance_transfer"] as const;
export type CashStatementLineKind = (typeof CASH_STATEMENT_LINE_KINDS)[number];

/** `legacy` : relevés jusqu'à janvier 2026 ; `current` : relevés à partir de février 2026. */
export type CashStatementFormat = "legacy" | "current";

/** Ligne lue sur un relevé. Montant signé en euros (positif = crédit). */
export interface CashStatementLine {
  /** Numéro de la ligne d'opération dans le relevé (à partir de 1). */
  lineNo: number;
  /** Date de comptabilisation (date d'écriture du courtier), `AAAA-MM-JJ`. */
  operationDate: string;
  /** Date de valeur, sur les relevés qui l'impriment. */
  valueDate?: string | undefined;
  kind: CashStatementLineKind;
  /** Libellé normalisé (sans nom de personne ni référence). */
  label: string;
  amount: number;
  quantity?: number | undefined;
  /** Nom abrégé de la valeur imprimé par le courtier : un indice d'affichage, jamais un critère. */
  name?: string | undefined;
  /** Date de paiement d'un coupon (« COUPONS ECHEANCE 26/09 »), `AAAA-MM-JJ`. */
  couponDate?: string | undefined;
}

/**
 * Enchaînement d'un relevé avec le précédent connu (importé ou du même lot) :
 * - `first` : aucun relevé antérieur connu ;
 * - `continuous` : mois suivant, l'ancien solde est le nouveau solde du précédent ;
 * - `account_change` : changement de compte, le relevé part de zéro et reprend le solde précédent ;
 * - `gap` : un ou plusieurs mois sans relevé (voir `missingPeriods` et `balanceMatches`) ;
 * - `balance_break` : mois suivant, mais l'ancien solde ne correspond pas au précédent.
 */
export const CASH_STATEMENT_CONTINUITY = ["first", "continuous", "account_change", "gap", "balance_break"] as const;
export type CashStatementContinuityStatus = (typeof CASH_STATEMENT_CONTINUITY)[number];

export interface CashStatementContinuity {
  status: CashStatementContinuityStatus;
  previousPeriod?: string | undefined;
  /** Mois sans relevé entre le précédent et celui-ci. */
  missingPeriods?: string[] | undefined;
  /** Pour un trou : le solde se suit malgré tout (mois probablement sans opération). */
  balanceMatches?: boolean | undefined;
}
