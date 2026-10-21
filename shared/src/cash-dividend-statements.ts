/**
 * Certification des dividendes encaissés par les relevés mensuels de coupons du courtier (PDF).
 *
 * Un relevé n'est jamais conservé : il est lu en mémoire et seuls les champs extraits (date,
 * ISIN, montants, mois et numéro de ligne) sont gardés. Un relevé dont les colonnes ou les totaux
 * sont incohérents est refusé en entier.
 */

/**
 * `manual` : vérifié par l'utilisateur ; `document` : certifié par un relevé du courtier. Le
 * document prime : une vérification manuelle ne remplace jamais une certification.
 */
export const DIVIDEND_VERIFICATIONS = ["manual", "document"] as const;
export type DividendVerification = (typeof DIVIDEND_VERIFICATIONS)[number];

export interface DividendVerificationInfo {
  status: DividendVerification;
  verifiedAt: string;
  /** Relevé et ligne (`2024-05#3`) d'une certification, sans donnée personnelle. */
  reference?: string | undefined;
}

/** Ligne de coupon lue sur un relevé. Montants en euros. */
export interface DividendStatementLine {
  /** Numéro de la ligne dans la section des coupons (à partir de 1). */
  lineNo: number;
  /** Date d'échéance, c'est-à-dire de paiement (`AAAA-MM-JJ`). */
  paymentDate: string;
  quantity?: number | undefined;
  name: string;
  isin: string;
  gross: number;
  /** Retenue à la source étrangère (« Crédit d'impôt »), nulle pour une valeur française. */
  withholding: number;
  netFiscal: number;
  commission: number;
  /** Montant réellement crédité sur les espèces (« Net client »). */
  net: number;
}

/**
 * Remboursement de capital (prime d'émission, réduction de capital) lu sur un relevé : jamais un
 * dividende, il devient un mouvement `capital_repayment` certifié par le relevé.
 */
export interface DividendStatementRefund {
  /** Numéro de la ligne dans la section des remboursements (à partir de 1). */
  lineNo: number;
  paymentDate: string;
  name: string;
  isin: string;
  quantity: number;
  gross: number;
  /** Montant réellement crédité (« Net client »). */
  amount: number;
}

/**
 * Rapprochement d'un remboursement avec le journal espèces (même montant au centime, date proche,
 * même actif quand les deux en ont un) :
 * - `certify` : un seul remboursement enregistré correspond, il est certifié ;
 * - `already_certified` : déjà certifié ou créé par cette ligne (réimport) ;
 * - `ambiguous` : plusieurs remboursements correspondent, l'utilisateur choisit ;
 * - `create` : aucun remboursement enregistré, il est créé et certifié ;
 * - `future` : date dans le futur, rien n'est fait.
 */
export const DIVIDEND_STATEMENT_REFUND_CASES = ["certify", "already_certified", "ambiguous", "create", "future"] as const;
export type DividendStatementRefundCase = (typeof DIVIDEND_STATEMENT_REFUND_CASES)[number];

export interface DividendStatementRefundPreview extends DividendStatementRefund {
  /** Clé d'un remboursement dans un lot : `<mois>#R<ligne>` (ex. `2024-05#R1`). */
  key: string;
  case: DividendStatementRefundCase;
  /** Antérieur ou égal à l'état initial : enregistré pour mémoire (déduit des dividendes déjà perçus), sans effet sur le solde. */
  beforeStart: boolean;
  /** Position portant l'ISIN, absente si l'ISIN est inconnu du portefeuille (le remboursement est alors enregistré sans actif). */
  position?: { id: number; symbol: string; name: string } | undefined;
  movement?: DividendStatementMovementRef | undefined;
  /** Remboursements enregistrés candidats d'un cas `ambiguous`. */
  candidates?: DividendStatementMovementRef[] | undefined;
  /** Un remboursement du même actif, d'un autre montant, existe à une date proche : doublon possible. */
  possibleDuplicate?: boolean | undefined;
}

/**
 * Rapprochement d'une ligne de relevé avec le compte espèces :
 * - `certify` : dividende déjà enregistré, même montant et même jour ;
 * - `already_certified` : déjà certifié par cette ligne (réimport) ;
 * - `mismatch` : dividende enregistré avec un montant ou une date différents ;
 * - `proposal` : proposition en attente ou ignorée, validée avec le net du relevé ;
 * - `create` : aucun dividende enregistré, crédit postérieur à l'état initial ;
 * - `opening` : crédit antérieur ou égal à l'état initial, déjà compris dans le solde déclaré ;
 * - `unknown_asset` : ISIN absent du portefeuille, position à choisir ;
 * - `future` : date de paiement dans le futur, rien n'est fait.
 */
export const DIVIDEND_STATEMENT_CASES = ["certify", "already_certified", "mismatch", "proposal", "create", "opening", "unknown_asset", "future"] as const;
export type DividendStatementCase = (typeof DIVIDEND_STATEMENT_CASES)[number];

export interface DividendStatementMovementRef {
  id: number;
  amount: number;
  effectiveAt: string;
  verification?: DividendVerificationInfo | undefined;
}

/** Retenue réelle comparée au taux estimé du pays de la société. */
export interface WithholdingComparison {
  actualRate: number;
  estimatedRate: number;
  /** Écart notable : le taux estimé est probablement faux pour ce titre. */
  notable: boolean;
}

export interface DividendStatementLinePreview extends DividendStatementLine {
  /** Clé d'une ligne dans un lot : `<mois>#<ligne>` (ex. `2024-05#3`). */
  key: string;
  case: DividendStatementCase;
  position?: { id: number; symbol: string; name: string } | undefined;
  movement?: DividendStatementMovementRef | undefined;
  proposalId?: number | undefined;
  withholdingCheck?: WithholdingComparison | undefined;
  /** Un dividende saisi sans actif, du même montant, existe à une date proche : doublon possible. */
  possibleDuplicate?: boolean | undefined;
}

export interface DividendStatementPreview {
  fileName: string;
  /** Mois du relevé (`AAAA-MM`), absent si le relevé est illisible. */
  period?: string | undefined;
  /** Relevé refusé en entier (illisible ou incohérent) : rien n'en sera importé. */
  error?: string | undefined;
  lines: DividendStatementLinePreview[];
  refunds: DividendStatementRefundPreview[];
  totalNet: number;
}

/** Dividendes perçus avant l'état initial, certifiables à partir des lignes de relevé. */
export interface OpeningDividendsCertification {
  referenceAt: string;
  /** Total des lignes antérieures déjà certifiées et de celles du lot. */
  certifiable: number;
  /** Montant déjà confirmé, s'il existe. */
  declared?: number | undefined;
  certifiedAt?: string | undefined;
}

export interface DividendStatementsPreviewDto {
  statements: DividendStatementPreview[];
  opening?: OpeningDividendsCertification | undefined;
  /** Positions proposées pour une ligne dont l'ISIN est inconnu du portefeuille. */
  positions: { id: number; symbol: string; name: string; isin?: string | undefined }[];
}

export interface DividendStatementLineDecision {
  key: string;
  apply: boolean;
  /** Position choisie pour un ISIN inconnu : l'ISIN y sera enregistré. */
  positionId?: number | undefined;
  /** Remboursement enregistré choisi pour un remboursement `ambiguous`. */
  movementId?: number | undefined;
}

export interface DividendStatementsConfirmInput {
  lines: DividendStatementLineDecision[];
  certifyOpening: boolean;
}

export interface DividendStatementsImportResult {
  certified: number;
  corrected: number;
  created: number;
  alreadyCertified: number;
  skipped: number;
  /** Remboursements de capital créés ou certifiés (inclus dans `created` et `certified`). */
  refunds: number;
  openingCertified: boolean;
  errors: { fileName: string; lineNo?: number | undefined; message: string }[];
}

/** Vérification d'un seul dividende avec le relevé du mois concerné. */
export const DIVIDEND_STATEMENT_CHECK_OUTCOMES = ["match", "already_certified", "amount_mismatch", "date_mismatch", "not_found", "other_month", "unknown_isin"] as const;
export type DividendStatementCheckOutcome = (typeof DIVIDEND_STATEMENT_CHECK_OUTCOMES)[number];

export interface DividendStatementCheck {
  outcome: DividendStatementCheckOutcome;
  period: string;
  expected: { amount: number; effectiveAt: string };
  /** Ligne rapprochée (même actif, date proche). */
  match?: DividendStatementLine | undefined;
  /** Lignes du relevé pour cet actif (ou toutes, si l'ISIN de l'actif est inconnu). */
  found: DividendStatementLine[];
}
