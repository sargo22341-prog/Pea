import type { CashStatementLineKind } from "./cash-statement-lines.js";

/**
 * Contrôle mensuel du compte espèces : pour chaque mois, le nouveau solde du relevé espèces est
 * comparé au solde calculé par l'application à la même date. Une opération rapprochée d'une ligne
 * de relevé est comptée à la date d'écriture de cette ligne (le courtier écrit un achat quelques
 * jours après son exécution) ; les autres à leur propre date.
 */

/**
 * Statut d'un mois :
 * - `ok` : soldes égaux au centime ;
 * - `mismatch` : écart entre le relevé et l'application ;
 * - `opening` : mois clos avant la date de départ, résumé par l'état initial (non comparable) ;
 * - `quiet` : aucun relevé, mais le solde se suit et l'application n'a aucune opération ce mois-là
 *   (mois probablement sans opération) ;
 * - `missing` : relevé manquant (mois avec des opérations, solde qui ne se suit pas, ou mois
 *   écoulé après le dernier relevé importé).
 */
export const CASH_MONTH_CHECK_STATUSES = ["ok", "mismatch", "opening", "quiet", "missing"] as const;
export type CashMonthCheckStatus = (typeof CASH_MONTH_CHECK_STATUSES)[number];

/** Document à importer pour rapprocher une ligne de relevé. */
export type CashMissingDocument = "trade_notice" | "coupon_statement";

/**
 * Cause possible d'un écart :
 * - `statement_line` : ligne du relevé sans opération correspondante dans l'application ;
 * - `app_entry` : opération de l'application absente du relevé (doublon ou erreur probable).
 */
export interface CashMonthIssue {
  source: "statement_line" | "app_entry";
  kind: Exclude<CashStatementLineKind, "balance_transfer">;
  /** Jour d'écriture (ligne) ou de l'opération, `AAAA-MM-JJ`. */
  date: string;
  /** Effet signé sur les espèces, en euros. */
  amount: number;
  /** Ligne du relevé (`2026-09#2`). */
  reference?: string | undefined;
  /** Opération de l'application (`transaction:<id>`, `movement:<id>`). */
  elementId?: string | undefined;
  /** Symbole de l'opération, ou nom abrégé imprimé sur le relevé. */
  label?: string | undefined;
  missingDocument?: CashMissingDocument | undefined;
}

export interface CashMonthCheck {
  /** Mois `AAAA-MM`. */
  period: string;
  status: CashMonthCheckStatus;
  /** Date du nouveau solde du relevé. */
  closingDate?: string | undefined;
  statementBalance?: number | undefined;
  /** Solde calculé par l'application à la date du nouveau solde (mois comparables seulement). */
  appBalance?: number | undefined;
  /** Application - relevé, en euros. */
  difference?: number | undefined;
  /** Écart apparu ce mois-ci : écart du mois - écart du dernier mois comparé. */
  monthDifference?: number | undefined;
  issues: CashMonthIssue[];
  missingDocuments: {
    cashStatement: boolean;
    /** Achats et ventes du relevé sans avis d'opéré importé. */
    tradeNotices: number;
    /** Coupons et remboursements du relevé non certifiés par un relevé de coupons. */
    couponStatements: number;
  };
}

export interface CashAccountCheckDto {
  /** Du plus récent au plus ancien, du premier relevé importé au dernier mois écoulé. */
  months: CashMonthCheck[];
  counts: Record<CashMonthCheckStatus, number>;
}
