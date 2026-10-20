import type { DividendProposalAcceptInput } from "@pea/shared";
import { db } from "../../../db.js";
import { cashRepository, type CashAccountRow } from "../../../repositories/cash/cash.repository.js";
import { dividendProposalsRepository, type DividendProposalRow } from "../../../repositories/cash/dividend-proposals.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { cashAccountService } from "../cash-account.service.js";
import { withCashGuard } from "../cash-guard.js";
import { entryTimeMs, isAbsorbed } from "../cash-ledger.js";
import { accountPendingMessage, assertNotFuture, positiveCents } from "../cash-movements.service.js";
import { isPaid } from "./dividend-proposal-mapper.js";
import { dividendImportRef } from "./dividend-proposal-rules.js";
import { alreadyRecorded } from "./dividend-proposals-sync.js";

export const proposalNotFoundMessage = "Proposition de dividende introuvable.";
export const proposalNotPendingMessage = "Cette proposition de dividende n'est plus en attente.";
export const proposalNotAcceptedMessage = "Seul un dividende deja enregistre peut etre corrige.";
export const dividendAlreadyRecordedMessage = "Ce dividende est deja enregistre dans le compte especes.";
export const creditBeforeReferenceMessage = "La date de credit est anterieure ou egale a la date de l'etat initial : ce dividende y est deja compris.";
export const proposalNotYetPaidMessage = "Ce dividende n'est pas encore verse.";

export function requireProposal(userId: number, id: number) {
  const row = dividendProposalsRepository.find(userId, id);
  if (!row) throw new HttpError(404, proposalNotFoundMessage);
  return row;
}

function requireReadyAccount(userId: number) {
  const account = cashAccountService.ensureAccount(userId);
  if (account.status !== "ready") throw new HttpError(409, accountPendingMessage);
  return account;
}

/** Montant et date du crédit : valeurs saisies, sinon valeurs par défaut, toujours contrôlées. */
function creditValues(account: CashAccountRow, input: DividendProposalAcceptInput, defaults: { amountCents: number; effectiveAt: string }, now: Date) {
  const effectiveAt = input.effectiveAt ?? defaults.effectiveAt;
  assertNotFuture(effectiveAt, now.getTime());
  if (isAbsorbed(effectiveAt, account.reference_at ?? undefined)) throw new HttpError(400, creditBeforeReferenceMessage);
  const amountCents = input.amount === undefined ? defaults.amountCents : positiveCents(input.amount, "Le montant");
  if (amountCents <= 0) throw new HttpError(400, "Le montant doit etre strictement positif.");
  return { amountCents, effectiveAt };
}

/**
 * Valide une proposition en attente : le mouvement `dividend` et le changement de statut sont
 * écrits dans une seule transaction, et la référence d'import unique interdit un second
 * enregistrement. `autoAccepted` trace un ajout sans clic (dividende sûr, réglage activé).
 */
export function acceptProposal(userId: number, id: number, input: DividendProposalAcceptInput, now: Date, autoAccepted = false) {
  db.transaction(() => {
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
  });
}

function acceptedMovement(row: DividendProposalRow) {
  if (row.status !== "accepted" || row.movement_id === null || row.credited_cents === null || row.credited_at === null) {
    throw new HttpError(409, proposalNotAcceptedMessage);
  }
  return { id: row.movement_id, amountCents: row.credited_cents, effectiveAt: row.credited_at };
}

/**
 * Corrige un dividende déjà enregistré (montant, date) en modifiant directement son mouvement.
 * Réduire un crédit peut découvrir le compte plus tard : la correction passe par `withCashGuard`
 * et n'est jamais financée par un versement.
 */
export function correctProposal(userId: number, id: number, input: DividendProposalAcceptInput, now: Date) {
  const row = requireProposal(userId, id);
  const movement = acceptedMovement(row);
  const account = requireReadyAccount(userId);
  const { amountCents, effectiveAt } = creditValues(account, input, movement, now);
  const earliest = entryTimeMs(effectiveAt) < entryTimeMs(movement.effectiveAt) ? effectiveAt : movement.effectiveAt;
  withCashGuard(userId, { effectiveAt: earliest, requiredCents: Math.max(0, movement.amountCents - amountCents), fundable: false }, () => {
    cashRepository.updateMovement(userId, movement.id, amountCents, effectiveAt);
    dividendProposalsRepository.markNotificationsRead(userId, now.toISOString(), id);
  });
}
