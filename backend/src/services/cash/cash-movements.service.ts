import type { CashFundingInput, CashLedgerDto, CashMovementType } from "@pea/shared";
import { db } from "../../db.js";
import { cashRepository, type CashAccountRow } from "../../repositories/cash/cash.repository.js";
import { dividendProposalsRepository } from "../../repositories/cash/dividend-proposals.repository.js";
import { portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { objectiveProjectionInvalidationService } from "../objectives/objective-projection-invalidation.service.js";
import { invalidateFrontendBlockCache } from "../shared/cache.service.js";
import { cashAccountService } from "./cash-account.service.js";
import { withCashGuard } from "./cash-guard.js";
import { centsToMoney, entryTimeMs, isAbsorbed, moneyToCents } from "./cash-ledger.js";
import { DIVIDEND_IMPORT_REF_PREFIX, isSameDividendCredit } from "./dividends/dividend-proposal-rules.js";

/** Marge tolérée sur une date « maintenant » saisie par un appareil dont l'horloge avance. */
const futureToleranceMs = 5 * 60 * 1000;

export const accountPendingMessage = "Configurez d'abord le compte especes du PEA.";
export const movementBeforeReferenceMessage = "Ce versement ou retrait est anterieur a la date de l'etat initial : corrigez plutot l'etat initial.";
export const flowsBeforeReferenceMessage = "Des versements ou retraits enregistres sont anterieurs a cette date de reference.";
export const negativeOpeningMessage = "Avec cet etat initial, le solde especes deviendrait negatif.";
export const dividendAlreadyValidatedMessage = "Ce dividende a deja ete enregistre depuis une proposition de dividende.";

export interface CashMovementInput {
  type: CashMovementType;
  amount: number;
  effectiveAt: string;
  positionId?: number | undefined;
  note?: string | undefined;
  funding?: CashFundingInput | undefined;
}

export interface CashAccountInput {
  referenceAt: string;
  openedAt?: string | null | undefined;
  cash: number;
  deposits: number;
  withdrawals: number;
}

export function positiveCents(amount: number, label: string) {
  const cents = moneyToCents(amount);
  if (!Number.isFinite(cents) || cents <= 0) throw new HttpError(400, `${label} doit etre strictement positif.`);
  return cents;
}

function nonNegativeCents(amount: number, label: string) {
  const cents = moneyToCents(amount);
  if (!Number.isFinite(cents) || cents < 0) throw new HttpError(400, `${label} doit etre positif ou nul.`);
  return cents;
}

export function assertNotFuture(effectiveAt: string, now = Date.now()) {
  if (entryTimeMs(effectiveAt) > now + futureToleranceMs) throw new HttpError(400, "La date ne peut pas etre dans le futur.");
}

function requireReady(account: CashAccountRow) {
  if (account.status !== "ready") throw new HttpError(409, accountPendingMessage);
}

/** Les espèces n'entrent que dans les blocs de synthèse : les caches de courbes restent valides. */
export function invalidateCashViews(userId: number) {
  invalidateFrontendBlockCache({ userId });
  objectiveProjectionInvalidationService.invalidateUser(userId, "cash ledger changed");
}

/**
 * Écritures du journal espèces : versements, retraits, dividendes encaissés, frais indépendants et
 * état initial. Chaque écriture qui débite les espèces passe par `withCashGuard`.
 */
export class CashMovementsService {
  create(userId: number, input: CashMovementInput): CashLedgerDto {
    const account = cashAccountService.ensureAccount(userId);
    requireReady(account);
    const amountCents = positiveCents(input.amount, "Le montant");
    assertNotFuture(input.effectiveAt);
    if ((input.type === "deposit" || input.type === "withdrawal") && isAbsorbed(input.effectiveAt, account.reference_at ?? undefined)) {
      throw new HttpError(400, movementBeforeReferenceMessage);
    }
    if (input.funding && input.type !== "fee") throw new HttpError(400, "Seuls des frais peuvent etre finances par un versement.");
    const position = input.positionId === undefined ? undefined : portfolioRepository.findPositionById(input.positionId, userId);
    if (input.positionId !== undefined && !position) throw new HttpError(404, "Position introuvable");
    if (input.type === "dividend" && position && validatedDividendCovers(userId, position.symbol, input.effectiveAt)) {
      throw new HttpError(409, dividendAlreadyValidatedMessage);
    }

    const insert = () => {
      cashRepository.insertMovement(userId, {
        type: input.type,
        amountCents,
        effectiveAt: input.effectiveAt,
        positionId: position?.id,
        symbol: position?.symbol,
        source: "manual",
        note: input.note?.trim() || null
      });
    };
    if (input.type === "withdrawal" || input.type === "fee") {
      withCashGuard(userId, { effectiveAt: input.effectiveAt, requiredCents: amountCents, fundable: input.type === "fee", funding: input.funding }, insert);
    } else {
      db.transaction(insert);
    }
    invalidateCashViews(userId);
    return cashAccountService.ledger(userId);
  }

  delete(userId: number, movementId: number): CashLedgerDto {
    const movement = cashRepository.findMovement(userId, movementId);
    if (!movement) throw new HttpError(404, "Mouvement introuvable.");
    withCashGuard(userId, { effectiveAt: movement.effective_at, requiredCents: movement.amount_cents, fundable: false }, () => {
      dividendProposalsRepository.releaseMovement(userId, movementId);
      cashRepository.deleteMovement(userId, movementId);
    });
    invalidateCashViews(userId);
    return cashAccountService.ledger(userId);
  }

  /**
   * Confirme ou corrige l'état initial. Les versements historiques sont des montants déclarés,
   * jamais déduits des achats ; le solde saisi résume toutes les opérations antérieures à la date
   * de référence, sans les compter deux fois. Chaque changement est tracé.
   */
  configure(userId: number, input: CashAccountInput): CashLedgerDto {
    assertNotFuture(input.referenceAt);
    if (input.openedAt) assertNotFuture(input.openedAt);
    const next = {
      status: "ready" as const,
      referenceAt: input.referenceAt,
      openedAt: input.openedAt ?? null,
      openingCashCents: nonNegativeCents(input.cash, "Le solde especes"),
      openingDepositsCents: nonNegativeCents(input.deposits, "Le total des versements"),
      openingWithdrawalsCents: nonNegativeCents(input.withdrawals, "Le total des retraits")
    };
    db.transaction(() => {
      const previous = cashAccountService.ensureAccount(userId);
      if (cashRepository.listExternalFlows(userId).some((flow) => isAbsorbed(flow.effective_at, input.referenceAt))) {
        throw new HttpError(409, flowsBeforeReferenceMessage);
      }
      cashRepository.updateAccount(userId, next);
      const after = cashAccountService.load(userId).result;
      if (after.minBalanceCents < 0) {
        throw new HttpError(422, negativeOpeningMessage, { code: "INSUFFICIENT_FUNDS", available: centsToMoney(next.openingCashCents), required: 0, shortfall: centsToMoney(-after.minBalanceCents), effectiveAt: after.firstNegativeAt ?? input.referenceAt, fundable: false });
      }
      cashRepository.insertRevision(userId, cashAccountService.settings(previous), cashAccountService.settings(requirePresentAccount(userId)));
    });
    invalidateCashViews(userId);
    return cashAccountService.ledger(userId);
  }
}

/** Un dividende validé depuis une proposition couvre-t-il déjà ce crédit (même actif, date proche) ? */
function validatedDividendCovers(userId: number, symbol: string, effectiveAt: string) {
  return dividendProposalsRepository.dividendMovements(userId).some((movement) =>
    movement.import_ref?.startsWith(DIVIDEND_IMPORT_REF_PREFIX) && isSameDividendCredit({ symbol: movement.symbol, effectiveAt: movement.effective_at }, { symbol, effectiveAt })
  );
}

function requirePresentAccount(userId: number) {
  const account = cashRepository.findAccount(userId);
  if (!account) throw new Error(`Compte especes introuvable pour l'utilisateur ${userId}.`);
  return account;
}

export const cashMovementsService = new CashMovementsService();
