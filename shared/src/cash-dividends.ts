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
}

export interface DividendProposalsDto {
  /** Propositions en attente dont la date de paiement est atteinte. */
  pending: DividendProposal[];
  ignored: DividendProposal[];
  /** Solde espèces actuel, pour afficher le solde avant / après validation. */
  cash: number;
}

/** Validation d'une proposition ; un montant ou une date fournis corrigent les valeurs proposées. */
export interface DividendProposalAcceptInput {
  amount?: number | undefined;
  effectiveAt?: string | undefined;
}
