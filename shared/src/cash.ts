import type { DividendVerificationInfo } from "./cash-dividend-statements.js";
import type { CashStatementCheck } from "./cash/cash-statements.js";

/**
 * Compte espèces du PEA : journal des mouvements et indicateurs dérivés.
 *
 * Les montants exposés par l'API sont en euros (deux décimales exactes) ; le backend les stocke et
 * les additionne en centimes entiers. Le solde espèces n'est jamais stocké : il est recalculé à
 * partir du journal (versements, retraits, achats, ventes, dividendes, autres crédits, frais).
 */

/** Plafond légal des versements sur un PEA classique (hors PEA-PME), en euros. */
export const PEA_DEPOSIT_CEILING_EUR = 150_000;

/** Ancienneté (en années) à partir de laquelle un retrait partiel n'entraîne plus la clôture du PEA. */
export const PEA_WITHDRAWAL_MATURITY_YEARS = 5;

/** Mouvements enregistrés dans le journal espèces (les achats et ventes vivent dans les transactions). */
export const CASH_MOVEMENT_TYPES = ["deposit", "withdrawal", "dividend", "capital_repayment", "compensation", "fee"] as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

/**
 * Autres crédits : remboursement de capital (prime d'émission, réduction de capital) et
 * indemnisation (rompus d'une attribution gratuite, soulte). Ils augmentent le solde espèces mais
 * ne sont ni des versements (plafond, rendement annualisé) ni des dividendes encaissés.
 */
export const CASH_OTHER_CREDIT_TYPES = ["capital_repayment", "compensation"] as const satisfies readonly CashMovementType[];
export type CashOtherCreditType = (typeof CASH_OTHER_CREDIT_TYPES)[number];

export function isOtherCreditType(type: string): type is CashOtherCreditType {
  return (CASH_OTHER_CREDIT_TYPES as readonly string[]).includes(type);
}

/** Toute ligne du journal : mouvements espèces, opérations sur titres et état initial de migration. */
export type CashLedgerEntryKind = CashMovementType | "buy" | "sell" | "opening";

export type CashMovementSource = "manual" | "csv" | "pdf" | "migration";

/**
 * Origine d'une ligne du journal : celle d'un mouvement, `statement` pour un dividende perçu
 * avant l'état initial, lu sur un relevé de coupons certifié (jamais un mouvement espèces), ou
 * `cash_statement` pour un mouvement créé depuis un relevé espèces.
 */
export type CashLedgerEntrySource = CashMovementSource | "statement" | "cash_statement";

/**
 * `pending` : portefeuille existant avant la refonte, état initial à confirmer par l'utilisateur ;
 * `ready` : solde espèces calculable (journal complet, ou état initial confirmé).
 */
export type CashAccountStatus = "pending" | "ready";

export interface CashAccountSettings {
  status: CashAccountStatus;
  /** Date de l'état initial : les opérations antérieures sont résumées par cet état. */
  referenceAt?: string | undefined;
  /** Date d'ouverture du PEA, pour l'avertissement sur les retraits. */
  openedAt?: string | undefined;
  /** Solde espèces à la date de référence. */
  openingCash: number;
  /** Versements cumulés jusqu'à la date de référence. */
  openingDeposits: number;
  /** Retraits cumulés jusqu'à la date de référence. */
  openingWithdrawals: number;
  /** Dividendes perçus jusqu'à la date de référence, confirmés par l'utilisateur. */
  openingDividends?: number | undefined;
  /** Date à laquelle les dividendes déjà perçus ont été certifiés par des relevés du courtier. */
  openingDividendsCertifiedAt?: string | undefined;
  updatedAt?: string | undefined;
}

export interface CashLedgerEntry {
  /**
   * Identifiant stable : `movement:<id>`, `transaction:<id>`, `opening` ou `statement-line:<id>`
   * (dividende d'avant l'état initial certifié par relevé, en lecture seule, sans effet sur le solde).
   */
  id: string;
  kind: CashLedgerEntryKind;
  effectiveAt: string;
  /** Effet signé sur le solde espèces (positif = crédit). */
  amount: number;
  /** Solde espèces après ce mouvement. */
  balanceAfter: number;
  /** Opération antérieure à l'état initial : déjà résumée par celui-ci, sans effet sur le solde. */
  absorbed: boolean;
  source: CashLedgerEntrySource;
  symbol?: string | undefined;
  name?: string | undefined;
  positionId?: number | undefined;
  /** ISIN d'une ligne de relevé, affiché quand aucune position ne porte cet ISIN. */
  isin?: string | undefined;
  quantity?: number | undefined;
  price?: number | undefined;
  fees?: number | undefined;
  /** Plus ou moins-value réalisée par une vente, frais déduits, selon le PRU applicable. */
  realizedGain?: number | undefined;
  importRef?: string | undefined;
  note?: string | undefined;
  /** Vérification d'un dividende encaissé (manuelle ou certifiée par relevé). */
  verification?: DividendVerificationInfo | undefined;
  /** Contrôle par les relevés espèces (absent pour l'état initial). */
  cashCheck?: CashStatementCheck | undefined;
}

export interface CashAccountSummary {
  status: CashAccountStatus;
  referenceAt?: string | undefined;
  openedAt?: string | undefined;
  cash: number;
  /** Versements externes cumulés depuis l'ouverture (jamais augmentés par un achat ou une vente). */
  deposits: number;
  withdrawals: number;
  netDeposits: number;
  /** Dividendes réellement encaissés : journal, plus ceux déclarés avant l'état initial. */
  cashDividends: number;
  /** Remboursements de capital et indemnisations postérieurs à l'état initial (ni versements ni dividendes). */
  otherCredits: number;
  /** Frais indépendants d'une opération sur titres. */
  standaloneFees: number;
  depositCeiling: number;
  /** Plafond restant : les retraits ne reconstituent pas le plafond. */
  remainingCeiling: number;
  realizedGain: number;
  /** Vrai quand un état initial résume l'historique : la performance historique n'est pas exacte. */
  historyIncomplete: boolean;
}

/** Vue d'ensemble du PEA : positions + espèces. */
export interface PeaOverview extends CashAccountSummary {
  positionsValue: number;
  /** Valeur PEA = valeur des positions + solde espèces. */
  totalValue: number;
  /** Plus-values latentes des positions détenues (valeur - prix de revient). */
  latentGain: number;
  /** Gain global = valeur PEA + retraits - versements. */
  globalGain: number;
  /** Gain global rapporté aux versements nets (indicatif, ignore la chronologie des flux). */
  simpleReturnPercent?: number | undefined;
  /** Taux de rendement interne annualisé des flux externes (XIRR) ; absent si l'historique est incomplet. */
  annualizedReturnPercent?: number | undefined;
}

export interface CashLedgerDto {
  summary: CashAccountSummary;
  settings: CashAccountSettings;
  /** Mouvements du plus récent au plus ancien. */
  entries: CashLedgerEntry[];
}

/** Détails d'une erreur 422 « solde espèces insuffisant ». */
export interface InsufficientFundsDetails {
  code: "INSUFFICIENT_FUNDS";
  /** Solde disponible juste avant l'opération. */
  available: number;
  /** Montant de l'opération (frais compris). */
  required: number;
  /** Versement minimal permettant de garder un solde positif ou nul. */
  shortfall: number;
  /** Date à laquelle le versement de financement serait enregistré. */
  effectiveAt: string;
  /** Le financement par versement est-il possible (non pour un retrait ou une suppression) ? */
  fundable: boolean;
}

/** Versement confirmé explicitement par l'utilisateur pour financer une opération. */
export interface CashFundingInput {
  amount: number;
}
