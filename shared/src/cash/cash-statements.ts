import type { CashStatementContinuity, CashStatementFormat, CashStatementLine } from "./cash-statement-lines.js";

/**
 * Import des relevés espèces et contrôle des éléments de l'application (voir
 * `cash-statement-lines.ts` pour la lecture d'un relevé).
 */

/** Plusieurs années de relevés mensuels (plus de 60) peuvent être importées en une fois. */
export const MAX_CASH_STATEMENT_FILES = 120;

/**
 * Rapprochement d'une ligne avec l'application :
 * - `already_verified` : déjà rapprochée (réimport sans effet) ;
 * - `verify` : un seul élément correspond, il sera vérifié ;
 * - `ambiguous` : plusieurs éléments correspondent, l'utilisateur choisit ;
 * - `create` : élément absent, il sera créé et vérifié (versement, retrait, frais, autre crédit,
 *   dividende dont la position est à confirmer) ;
 * - `missing_trade` : achat ou vente sans avis d'opéré importé, rien n'est créé ;
 * - `missing_dividend` : coupon antérieur à l'état initial sans relevé de coupons importé ;
 * - `opening` : versement, retrait ou frais antérieur à l'état initial, résumé par celui-ci ;
 * - `neutral` : reprise du solde d'un ancien compte, aucun mouvement.
 */
export const CASH_STATEMENT_LINE_CASES = ["already_verified", "verify", "ambiguous", "create", "missing_trade", "missing_dividend", "opening", "neutral"] as const;
export type CashStatementLineCase = (typeof CASH_STATEMENT_LINE_CASES)[number];

/** Élément de l'application rapprochable : `transaction:<id>`, `movement:<id>` ou `statement-line:<id>`. */
export interface CashStatementTarget {
  id: string;
  kind: "buy" | "sell" | "deposit" | "withdrawal" | "dividend" | "capital_repayment" | "compensation" | "fee";
  effectiveAt: string;
  /** Effet signé sur les espèces, en euros. */
  amount: number;
  symbol?: string | undefined;
  quantity?: number | undefined;
}

export interface CashStatementLinePreview extends CashStatementLine {
  /** Clé de la ligne dans un lot : `<mois>#<ligne>` (ex. `2026-09#2`). */
  key: string;
  case: CashStatementLineCase;
  /** Élément rapproché (`verify`, `already_verified`). */
  target?: CashStatementTarget | undefined;
  /** Éléments candidats d'un cas `ambiguous`. */
  candidates?: CashStatementTarget[] | undefined;
  /** Antérieure ou égale à l'état initial : vérifie l'historique sans effet sur le solde. */
  beforeStart: boolean;
}

export interface CashStatementPreview {
  fileName: string;
  /** Mois du relevé (`AAAA-MM`), absent si le relevé est illisible. */
  period?: string | undefined;
  /** Relevé refusé en entier (illisible, incohérent ou en double) : rien n'en sera importé. */
  error?: string | undefined;
  format?: CashStatementFormat | undefined;
  openingDate?: string | undefined;
  closingDate?: string | undefined;
  openingBalance?: number | undefined;
  closingBalance?: number | undefined;
  /** Déjà importé à l'identique : seules les lignes non rapprochées peuvent l'être. */
  alreadyImported?: boolean | undefined;
  continuity?: CashStatementContinuity | undefined;
  lines: CashStatementLinePreview[];
}

export interface CashStatementsPreviewDto {
  statements: CashStatementPreview[];
  /** Positions proposées pour un coupon à créer (le relevé ne donne ni ISIN ni symbole). */
  positions: { id: number; symbol: string; name: string }[];
}

export interface CashStatementLineDecision {
  key: string;
  apply: boolean;
  /** Élément choisi pour une ligne `ambiguous` (identifiant de `CashStatementTarget`). */
  targetId?: string | undefined;
  /** Position d'un coupon à créer. */
  positionId?: number | undefined;
}

export interface CashStatementsConfirmInput {
  lines: CashStatementLineDecision[];
}

export interface CashStatementsImportResult {
  /** Relevés enregistrés (nouveaux). */
  statements: number;
  verified: number;
  created: number;
  alreadyVerified: number;
  /** Lignes laissées à rapprocher (décochées, ambiguës sans choix, élément manquant). */
  unmatched: number;
  errors: { fileName: string; lineNo?: number | undefined; message: string }[];
}

/**
 * Contrôle d'un élément de l'application par les relevés espèces :
 * - `verified` : rapproché d'une ligne de relevé (« Vérifié par relevé espèces ») ;
 * - `to_verify` : pas encore rapproché (aucun relevé importé pour sa période) ;
 * - `not_found` : sa période est couverte par des relevés importés, mais il n'y figure pas
 *   (doublon ou erreur probable).
 */
export const CASH_STATEMENT_CHECK_STATUSES = ["verified", "to_verify", "not_found"] as const;
export type CashStatementCheckStatus = (typeof CASH_STATEMENT_CHECK_STATUSES)[number];

export interface CashStatementCheck {
  status: CashStatementCheckStatus;
  /** Relevé et ligne (`2026-09#2`), sans donnée personnelle. */
  reference?: string | undefined;
  verifiedAt?: string | undefined;
}

/** Code d'erreur (409) d'une modification qui retirerait une vérification par relevé espèces. */
export const CASH_STATEMENT_VERIFIED_CODE = "CASH_STATEMENT_VERIFIED";

export interface CashStatementVerifiedDetails {
  code: typeof CASH_STATEMENT_VERIFIED_CODE;
  reference: string;
}
