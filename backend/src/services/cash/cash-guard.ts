import type { CashFundingInput, InsufficientFundsDetails } from "@pea/shared";
import { db } from "../../db.js";
import { cashRepository } from "../../repositories/cash/cash.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { cashAccountService } from "./cash-account.service.js";
import { centsToMoney, entryTimeMs, isAbsorbed, moneyToCents, shortfallCents, type LedgerResult } from "./cash-ledger.js";

export const insufficientFundsMessage = "Solde especes insuffisant.";
export const fundingNotAllowedMessage = "Cette operation ne peut pas etre financee par un versement.";
export const fundingBeforeReferenceMessage = "Le versement serait anterieur a la date de l'etat initial du compte especes.";
export const fundingPendingMessage = "Configurez d'abord le compte especes du PEA.";
export const fundingNoteText = "Versement confirme pour financer une operation";

export interface CashGuardOptions {
  /** Date de l'opération contrôlée : date du versement de financement éventuel. */
  effectiveAt: string;
  /**
   * Montant de l'opération (frais compris), en centimes, pour le récapitulatif. Par défaut : total
   * des débits ajoutés au journal par la mutation (lot d'import).
   */
  requiredCents?: number | undefined;
  /** Faux pour un retrait ou une suppression : seul un achat ou des frais se financent par un versement. */
  fundable: boolean;
  /** Versement confirmé explicitement par l'utilisateur, enregistré dans la même transaction. */
  funding?: CashFundingInput | undefined;
}

/** Garde déjà active dans la transaction courante (import de plusieurs lignes) : contrôle unique. */
let activeGuards = 0;

/** Solde disponible juste avant un instant (les mouvements simultanés ne sont pas pris en compte). */
function balanceBefore(result: LedgerResult, effectiveAt: string) {
  const time = entryTimeMs(effectiveAt);
  let balance = 0;
  for (const entry of result.entries) {
    if (entryTimeMs(entry.effectiveAt) >= time) break;
    balance = entry.balanceAfterCents;
  }
  return balance;
}

/** Débits présents après la mutation et absents avant (nouveaux achats, frais ou retraits). */
function addedDebitsCents(before: LedgerResult, after: LedgerResult) {
  const known = new Set(before.entries.map((entry) => entry.id));
  return after.entries.reduce((sum, entry) => (!known.has(entry.id) && !entry.absorbed && entry.amountCents < 0 ? sum - entry.amountCents : sum), 0);
}

function insufficientFunds(options: CashGuardOptions, before: LedgerResult, after: LedgerResult, missingCents: number): HttpError {
  const details: InsufficientFundsDetails = {
    code: "INSUFFICIENT_FUNDS",
    available: centsToMoney(balanceBefore(before, options.effectiveAt)),
    required: centsToMoney(options.requiredCents ?? addedDebitsCents(before, after)),
    shortfall: centsToMoney(missingCents),
    effectiveAt: options.effectiveAt,
    fundable: options.fundable
  };
  return new HttpError(422, insufficientFundsMessage, details);
}

/**
 * Point de contrôle unique des opérations qui débitent les espèces (achats, frais, retraits,
 * modifications et suppressions d'opérations) : la mutation et le versement de financement
 * éventuel s'exécutent dans une seule transaction SQLite, annulée si le solde devient négatif.
 *
 * Tant que le compte attend son état initial (`pending`), le solde n'est pas connu : la mutation
 * passe sans contrôle et sera résumée par l'état initial confirmé ensuite.
 */
export function withCashGuard<T>(userId: number, options: CashGuardOptions, mutate: () => T): T {
  if (activeGuards > 0) {
    if (options.funding) throw new HttpError(400, fundingNotAllowedMessage);
    return mutate();
  }
  activeGuards += 1;
  try {
    return db.transaction(() => {
      const account = cashAccountService.ensureAccount(userId);
      if (account.status !== "ready") {
        if (options.funding) throw new HttpError(409, fundingPendingMessage);
        return mutate();
      }
      const before = cashAccountService.load(userId).result;
      const fundingCents = options.funding ? moneyToCents(options.funding.amount) : 0;
      if (options.funding) {
        if (!options.fundable) throw new HttpError(400, fundingNotAllowedMessage);
        if (fundingCents <= 0) throw new HttpError(400, "Le montant du versement doit etre strictement positif.");
        if (isAbsorbed(options.effectiveAt, account.reference_at ?? undefined)) throw new HttpError(400, fundingBeforeReferenceMessage);
        cashRepository.insertMovement(userId, { type: "deposit", amountCents: fundingCents, effectiveAt: options.effectiveAt, source: "manual", note: fundingNoteText });
      }
      const value = mutate();
      const after = cashAccountService.load(userId).result;
      const missing = shortfallCents(before, after);
      if (missing > 0) throw insufficientFunds(options, before, after, missing + fundingCents);
      return value;
    });
  } finally {
    activeGuards -= 1;
  }
}

/**
 * Date d'un versement de financement pour un lot d'opérations : la plus ancienne opération
 * postérieure à l'état initial (le versement couvre ainsi tous les manques suivants), ou maintenant.
 */
export function batchFundingDate(userId: number, dates: string[], now = new Date()) {
  const referenceAt = cashAccountService.ensureAccount(userId).reference_at ?? undefined;
  const times = dates.filter((date) => !isAbsorbed(date, referenceAt)).map(entryTimeMs).filter((time) => time > 0);
  return times.length ? new Date(Math.min(...times)).toISOString() : now.toISOString();
}
