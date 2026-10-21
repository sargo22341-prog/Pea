import type { DividendVerificationInfo } from "./cash-dividend-statements.js";

/**
 * Propositions de dividendes encaissés : chaque détachement réel d'un actif détenu devient, à sa
 * date de paiement, une proposition à valider. Aucun dividende n'est crédité sur les espèces sans
 * confirmation explicite de l'utilisateur.
 */

export const DIVIDEND_PROPOSAL_STATUSES = ["pending", "accepted", "ignored"] as const;
export type DividendProposalStatus = (typeof DIVIDEND_PROPOSAL_STATUSES)[number];

/** Origine du pays retenu pour la retenue à la source. */
export type WithholdingBasis = "isin" | "listing" | "unknown";

export interface DividendProposal {
  id: number;
  symbol: string;
  name: string;
  positionId?: number | undefined;
  /** Date de détachement (ISO). */
  exDividendAt: string;
  /** Date de paiement publiée, ou estimée à partir du détachement. */
  paymentAt: string;
  paymentEstimated: boolean;
  /** Quantité détenue à la date de détachement (divisions validées appliquées). */
  quantity: number;
  amountPerShare: number;
  currency: string;
  grossAmount: number;
  /** Taux de retenue à la source estimé (0,15 = 15 %). */
  withholdingRate: number;
  withholdingAmount: number;
  /** Montant net proposé au crédit des espèces. */
  netAmount: number;
  /** Pays (code ISO 3166 alpha-2) retenu pour la retenue, s'il est connu. */
  country?: string | undefined;
  withholdingBasis: WithholdingBasis;
  /** Pays incertain, fonds possiblement exonéré ou devise étrangère : montant à vérifier. */
  needsReview: boolean;
  status: DividendProposalStatus;
  decidedAt?: string | undefined;
  /** Validée sans clic par l'ajout automatique des dividendes sûrs. */
  autoAccepted: boolean;
  /** Notification « ajouté automatiquement » déjà lue. */
  notificationRead: boolean;
  /** Montant et date réellement crédités (proposition validée), pour une correction. */
  creditedAmount?: number | undefined;
  creditedAt?: string | undefined;
  /** Mouvement créé à la validation, et sa vérification éventuelle. */
  movementId?: number | undefined;
  verification?: DividendVerificationInfo | undefined;
}

export interface DividendProposalsDto {
  /** Propositions en attente dont la date de paiement est atteinte. */
  pending: DividendProposal[];
  ignored: DividendProposal[];
  /** Dividendes validés récemment (corrigeables), dont les ajouts automatiques non lus. */
  recent: DividendProposal[];
  /** Ajouts automatiques dont la notification n'est pas encore lue. */
  unreadAutoAccepted: number;
  /** Solde espèces actuel, pour afficher le solde avant / après validation. */
  cash: number;
}

/** Durée pendant laquelle un dividende validé reste listé (et corrigeable) parmi les récents. */
export const DIVIDEND_RECENT_DAYS = 30;

export interface DividendSettings {
  /**
   * Enregistre sans confirmation les dividendes sûrs : ISIN connu, pays de la table des retenues,
   * hors fonds possiblement exonérés, en euros, sans saisie manuelle proche. Les autres restent à
   * confirmer.
   */
  autoAccept: boolean;
}

/** Raison pour laquelle l'estimation des dividendes déjà perçus doit être vérifiée. */
export type OpeningDividendsWarning =
  /** Le calcul donne un montant négatif : opérations manquantes ou versements surévalués. */
  | "negative"
  /** Des opérations antérieures viennent d'un import CSV de détentions (montants approchés). */
  | "approximate_trades"
  /** Aucune opération sur titres avant la date de référence : le calcul ne peut rien recouper. */
  | "no_trades"
  /** Écart important avec l'estimation tirée des dividendes publiés. */
  | "mismatch";

/**
 * Dividendes déjà perçus avant l'état initial, déduits du solde déclaré : solde espèces -
 * versements nets + achats - ventes + frais = dividendes. À confirmer par l'utilisateur.
 */
export interface OpeningDividendsEstimate {
  referenceAt: string;
  cash: number;
  netDeposits: number;
  /** Coût des achats antérieurs, frais inclus. */
  buys: number;
  /** Produit des ventes antérieures, frais déduits. */
  sells: number;
  standaloneFees: number;
  /** Remboursements de capital et indemnisations antérieurs : des crédits qui ne sont pas des dividendes. */
  otherCredits: number;
  /** Résultat du calcul (peut être négatif si l'historique est incomplet). */
  implied: number;
  /** Recoupement : dividendes publiés × quantité détenue, avant et après retenue estimée. */
  publishedGross: number;
  publishedNet: number;
  warnings: OpeningDividendsWarning[];
  /** Montant déjà confirmé par l'utilisateur, s'il existe. */
  declared?: number | undefined;
}

/** Validation d'une proposition ; un montant ou une date fournis corrigent les valeurs proposées. */
export interface DividendProposalAcceptInput {
  amount?: number | undefined;
  effectiveAt?: string | undefined;
  /** Correction d'un dividende certifié par relevé : la certification est retirée en connaissance de cause. */
  confirmUncertify?: boolean | undefined;
  /** Correction d'un dividende vérifié par relevé espèces : la vérification est retirée en connaissance de cause. */
  confirmUnverify?: boolean | undefined;
}
