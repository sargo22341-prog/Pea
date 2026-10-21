import { DAY_MS, type CashOtherCreditType } from "@pea/shared";
import type { CashMovementRow } from "../../../repositories/cash/cash.repository.js";
import { entryTimeMs } from "../cash-ledger.js";

/**
 * Rapprochement d'un remboursement de capital ou d'une indemnisation lu sur un document du
 * courtier avec les mouvements enregistrés. Critères objectifs uniquement : même type, même
 * montant au centime, date proche, même actif quand les deux en ont un. Le nom lu sur le document
 * n'est jamais un critère. Règles pures, sans accès à la base.
 */

/**
 * Écart maximal entre la date d'un document et celle d'un mouvement saisi pour le même crédit : le
 * relevé de coupons est daté du paiement, une saisie manuelle peut l'être du jour de lecture du
 * relevé espèces (écrit jusqu'à une douzaine de jours plus tard).
 */
export const OTHER_CREDIT_MATCH_WINDOW_DAYS = 15;

export interface DocumentCredit {
  type: CashOtherCreditType;
  amountCents: number;
  effectiveAt: string;
  /** Position identifiée par l'ISIN du document, absente si l'ISIN est inconnu du portefeuille. */
  positionId?: number | undefined;
  /** Référence du document (`AAAA-MM#R1`) : un mouvement déjà certifié par une autre ligne est exclu. */
  reference: string;
}

function withinWindow(movement: Pick<CashMovementRow, "effective_at">, effectiveAt: string) {
  return Math.abs(entryTimeMs(movement.effective_at) - entryTimeMs(effectiveAt)) <= OTHER_CREDIT_MATCH_WINDOW_DAYS * DAY_MS;
}

function compatibleAsset(movement: Pick<CashMovementRow, "position_id">, positionId: number | undefined) {
  return movement.position_id === null || positionId === undefined || movement.position_id === positionId;
}

/** Mouvement déjà rapproché d'une autre ligne de document : il ne peut pas l'être une seconde fois. */
function tiedToOtherDocument(movement: Pick<CashMovementRow, "verification" | "verification_ref">, reference: string) {
  return movement.verification === "document" && movement.verification_ref !== reference;
}

/** Mouvements qui peuvent être ce crédit ; plusieurs candidats sont une ambiguïté à trancher par l'utilisateur. */
export function otherCreditCandidates(movements: readonly CashMovementRow[], credit: DocumentCredit) {
  return movements.filter((movement) => movement.type === credit.type
    && movement.amount_cents === credit.amountCents
    && withinWindow(movement, credit.effectiveAt)
    && compatibleAsset(movement, credit.positionId)
    && !tiedToOtherDocument(movement, credit.reference));
}

/** Même actif, date proche, autre montant : un doublon possible, à ne pas créer sans décision explicite. */
export function hasNearbyOtherAmount(movements: readonly CashMovementRow[], credit: DocumentCredit) {
  return movements.some((movement) => movement.type === credit.type
    && movement.amount_cents !== credit.amountCents
    && withinWindow(movement, credit.effectiveAt)
    && compatibleAsset(movement, credit.positionId));
}
