import type { DividendProposalAcceptInput } from "@pea/shared";
import { db } from "../../../db.js";
import { cashRepository } from "../../../repositories/cash/cash.repository.js";
import { dividendProposalsRepository, type DividendProposalRow } from "../../../repositories/cash/dividend-proposals.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { correctDividendMovement, creditValues, requireReadyAccount } from "./dividend-credit.js";
import { isPaid } from "./dividend-proposal-mapper.js";
import { dividendImportRef } from "./dividend-proposal-rules.js";
import { alreadyRecorded } from "./dividend-proposals-sync.js";

export const proposalNotFoundMessage = "Proposition de dividende introuvable.";
export const proposalNotPendingMessage = "Cette proposition de dividende n'est plus en attente.";
export const proposalNotAcceptedMessage = "Seul un dividende deja enregistre peut etre corrige.";
export const dividendAlreadyRecordedMessage = "Ce dividende est deja enregistre dans le compte especes.";
export const proposalNotYetPaidMessage = "Ce dividende n'est pas encore verse.";

export function requireProposal(userId: number, id: number) {
  const row = dividendProposalsRepository.find(userId, id);
  if (!row) throw new HttpError(404, proposalNotFoundMessage);
  return row;
}

/**
 * Valide une proposition en attente : le mouvement `dividend` et le changement de statut sont
 * écrits dans une seule transaction, et la référence d'import unique interdit un second
 * enregistrement. `autoAccepted` trace un ajout sans clic (dividende sûr, réglage activé).
 * Renvoie l'identifiant du mouvement créé (certifiable dans la même transaction par l'appelant).
 */
export function acceptProposal(userId: number, id: number, input: DividendProposalAcceptInput, now: Date, autoAccepted = false) {
  return db.transaction(() => {
    const row = requireProposal(userId, id);
    if (row.status !== "pending") throw new HttpError(409, proposalNotPendingMessage);
    if (!isPaid(row, now)) throw new HttpError(409, proposalNotYetPaidMessage);
    const account = requireReadyAccount(userId);
    const { amountCents, effectiveAt } = creditValues(account, input, { amountCents: row.net_cents, effectiveAt: row.payment_at }, now);

    const importRef = dividendImportRef(row.symbol, row.ex_date);
    const movements = dividendProposalsRepository.dividendMovements(userId);
    const candidate = { symbol: row.symbol, exDate: row.ex_date, paymentAt: row.payment_at };
    if (alreadyRecorded(candidate, movements) || alreadyRecorded({ ...candidate, paymentAt: effectiveAt }, movements)) {
      throw new HttpError(409, dividendAlreadyRecordedMessage);
    }
    cashRepository.insertMovement(userId, { type: "dividend", amountCents, effectiveAt, positionId: row.position_id, symbol: row.symbol, source: "manual", importRef });
    const movement = cashRepository.findMovementByImportRef(userId, importRef);
    if (!movement) throw new Error(`Mouvement de dividende introuvable apres insertion (${importRef}).`);
    dividendProposalsRepository.changeStatus(userId, id, { from: "pending", to: "accepted", decidedAt: now.toISOString(), movementId: movement.id, autoAccepted });
    return movement.id;
  });
}

function acceptedMovementId(row: DividendProposalRow) {
  if (row.status !== "accepted" || row.movement_id === null) throw new HttpError(409, proposalNotAcceptedMessage);
  return row.movement_id;
}

/** Corrige un dividende déjà enregistré depuis une proposition (voir `correctDividendMovement`). */
export function correctProposal(userId: number, id: number, input: DividendProposalAcceptInput, now: Date) {
  const row = requireProposal(userId, id);
  const movement = cashRepository.findMovement(userId, acceptedMovementId(row));
  if (!movement) throw new HttpError(409, proposalNotAcceptedMessage);
  correctDividendMovement(userId, movement, input, now, () => {
    dividendProposalsRepository.markNotificationsRead(userId, now.toISOString(), id);
  });
}
