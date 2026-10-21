import type { DividendProposalAcceptInput } from "@pea/shared";
import { cashRepository, type CashAccountRow, type CashMovementRow } from "../../../repositories/cash/cash.repository.js";
import { dividendVerificationRepository } from "../../../repositories/cash/dividend-verification.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { cashAccountService } from "../cash-account.service.js";
import { withCashGuard } from "../cash-guard.js";
import { entryTimeMs, isAbsorbed } from "../cash-ledger.js";
import { accountPendingMessage, assertNotFuture, positiveCents } from "../cash-movements.service.js";
import { assertUnverifyConsent, releaseVerification } from "../cash-statements/verification-guard.js";

export const creditBeforeReferenceMessage = "La date de credit est anterieure ou egale a la date de l'etat initial : ce dividende y est deja compris.";
export const certifiedDividendMessage = "Ce dividende est certifie par un releve : le corriger retirera la certification. Confirmez la correction.";
export const notADividendMessage = "Seul un dividende encaisse peut etre verifie ou corrige ici.";

/** Code d'erreur d'une correction qui retirerait une certification sans confirmation explicite. */
export const CERTIFIED_DIVIDEND_CODE = "CERTIFIED_DIVIDEND";

export function requireReadyAccount(userId: number) {
  const account = cashAccountService.ensureAccount(userId);
  if (account.status !== "ready") throw new HttpError(409, accountPendingMessage);
  return account;
}

/** Montant et date du crédit : valeurs saisies, sinon valeurs par défaut, toujours contrôlées. */
export function creditValues(account: CashAccountRow, input: DividendProposalAcceptInput, defaults: { amountCents: number; effectiveAt: string }, now: Date) {
  const effectiveAt = input.effectiveAt ?? defaults.effectiveAt;
  assertNotFuture(effectiveAt, now.getTime());
  if (isAbsorbed(effectiveAt, account.reference_at ?? undefined)) throw new HttpError(400, creditBeforeReferenceMessage);
  const amountCents = input.amount === undefined ? defaults.amountCents : positiveCents(input.amount, "Le montant");
  if (amountCents <= 0) throw new HttpError(400, "Le montant doit etre strictement positif.");
  return { amountCents, effectiveAt };
}

/** Mouvement `dividend` de l'utilisateur ; celui d'un autre utilisateur est introuvable (404). */
export function requireDividendMovement(userId: number, movementId: number) {
  const movement = cashRepository.findMovement(userId, movementId);
  if (!movement) throw new HttpError(404, "Mouvement introuvable.");
  if (movement.type !== "dividend") throw new HttpError(400, notADividendMessage);
  return movement;
}

/**
 * Corrige le montant ou la date d'un dividende enregistré. Une correction qui change une valeur
 * retire la vérification (elle portait sur l'ancienne valeur) ; retirer une certification par
 * relevé de coupons exige `confirmUncertify`, une vérification par relevé espèces `confirmUnverify`. Réduire un crédit peut découvrir le compte plus tard : la
 * correction passe par `withCashGuard` et n'est jamais financée par un versement.
 */
export function correctDividendMovement(userId: number, movement: CashMovementRow, input: DividendProposalAcceptInput, now: Date, afterWrite?: () => void) {
  const account = requireReadyAccount(userId);
  const { amountCents, effectiveAt } = creditValues(account, input, { amountCents: movement.amount_cents, effectiveAt: movement.effective_at }, now);
  const changed = amountCents !== movement.amount_cents || entryTimeMs(effectiveAt) !== entryTimeMs(movement.effective_at);
  if (changed && movement.verification === "document" && input.confirmUncertify !== true) {
    throw new HttpError(409, certifiedDividendMessage, { code: CERTIFIED_DIVIDEND_CODE });
  }
  if (changed) assertUnverifyConsent(userId, { movementId: movement.id }, input);
  const earliest = entryTimeMs(effectiveAt) < entryTimeMs(movement.effective_at) ? effectiveAt : movement.effective_at;
  withCashGuard(userId, { effectiveAt: earliest, requiredCents: Math.max(0, movement.amount_cents - amountCents), fundable: false }, () => {
    cashRepository.updateMovement(userId, movement.id, amountCents, effectiveAt);
    if (changed) {
      dividendVerificationRepository.clearVerification(userId, movement.id);
      releaseVerification(userId, { movementId: movement.id });
    }
    afterWrite?.();
  });
}
