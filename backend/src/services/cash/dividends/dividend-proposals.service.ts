import type { CashLedgerDto, DividendProposal, DividendProposalAcceptInput, DividendProposalsDto } from "@pea/shared";
import { db } from "../../../db.js";
import { cashRepository } from "../../../repositories/cash/cash.repository.js";
import { dividendProposalsRepository, type DividendProposalRow } from "../../../repositories/cash/dividend-proposals.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { cashAccountService } from "../cash-account.service.js";
import { centsToMoney, isAbsorbed } from "../cash-ledger.js";
import { accountPendingMessage, assertNotFuture, invalidateCashViews, positiveCents } from "../cash-movements.service.js";
import { dividendImportRef } from "./dividend-proposal-rules.js";
import { alreadyRecorded, syncDividendProposals } from "./dividend-proposals-sync.js";

export const proposalNotFoundMessage = "Proposition de dividende introuvable.";
export const proposalNotPendingMessage = "Cette proposition de dividende n'est plus en attente.";
export const proposalNotIgnoredMessage = "Cette proposition de dividende n'est pas ignoree.";
export const dividendAlreadyRecordedMessage = "Ce dividende est deja enregistre dans le compte especes.";
export const creditBeforeReferenceMessage = "La date de credit est anterieure ou egale a la date de l'etat initial : ce dividende y est deja compris.";
export const proposalNotYetPaidMessage = "Ce dividende n'est pas encore verse.";

export interface DividendProposalDecision {
  ledger: CashLedgerDto;
  proposals: DividendProposalsDto;
}

function toProposal(row: DividendProposalRow): DividendProposal {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name ?? row.symbol,
    positionId: row.position_id ?? undefined,
    exDividendAt: row.ex_dividend_at,
    paymentAt: row.payment_at,
    paymentEstimated: row.payment_estimated === 1,
    quantity: row.quantity,
    amountPerShare: row.amount_per_share,
    currency: row.currency,
    grossAmount: centsToMoney(row.gross_cents),
    withholdingRate: row.withholding_rate,
    withholdingAmount: centsToMoney(row.withholding_cents),
    netAmount: centsToMoney(row.net_cents),
    country: row.country ?? undefined,
    withholdingBasis: row.withholding_basis,
    needsReview: row.needs_review === 1,
    status: row.status,
    decidedAt: row.decided_at ?? undefined
  };
}

/** Une proposition n'est visible (et validable) qu'à partir de sa date de paiement. */
function isPaid(row: DividendProposalRow, now: Date) {
  return Date.parse(row.payment_at) <= now.getTime();
}

function requireProposal(userId: number, id: number) {
  const row = dividendProposalsRepository.find(userId, id);
  if (!row) throw new HttpError(404, proposalNotFoundMessage);
  return row;
}

/**
 * Propositions de dividendes encaissés. Rien n'est crédité sans validation explicite : la
 * validation crée le mouvement `dividend` et change le statut dans une seule transaction, et la
 * référence d'import unique `dividend:<SYMBOLE>:<date>` interdit tout second enregistrement.
 */
export const dividendProposalsService = {
  list(userId: number, now = new Date()): DividendProposalsDto {
    syncDividendProposals(userId, now);
    const account = cashAccountService.ensureAccount(userId);
    const rows = account.status === "ready" ? dividendProposalsRepository.listForUser(userId) : [];
    return {
      pending: rows.filter((row) => row.status === "pending" && isPaid(row, now)).map(toProposal),
      ignored: rows.filter((row) => row.status === "ignored").map(toProposal),
      cash: cashAccountService.summary(userId).cash
    };
  },

  accept(userId: number, id: number, input: DividendProposalAcceptInput, now = new Date()): DividendProposalDecision {
    db.transaction(() => {
      const row = requireProposal(userId, id);
      if (row.status !== "pending") throw new HttpError(409, proposalNotPendingMessage);
      if (!isPaid(row, now)) throw new HttpError(409, proposalNotYetPaidMessage);
      const account = cashAccountService.ensureAccount(userId);
      if (account.status !== "ready") throw new HttpError(409, accountPendingMessage);
      const effectiveAt = input.effectiveAt ?? row.payment_at;
      assertNotFuture(effectiveAt, now.getTime());
      if (isAbsorbed(effectiveAt, account.reference_at ?? undefined)) throw new HttpError(400, creditBeforeReferenceMessage);
      const amountCents = input.amount === undefined ? row.net_cents : positiveCents(input.amount, "Le montant");
      if (amountCents <= 0) throw new HttpError(400, "Le montant doit etre strictement positif.");

      const importRef = dividendImportRef(row.symbol, row.ex_date);
      const movements = dividendProposalsRepository.dividendMovements(userId);
      const candidate = { symbol: row.symbol, exDate: row.ex_date, paymentAt: row.payment_at };
      if (alreadyRecorded(candidate, movements) || alreadyRecorded({ ...candidate, paymentAt: effectiveAt }, movements)) {
        throw new HttpError(409, dividendAlreadyRecordedMessage);
      }
      cashRepository.insertMovement(userId, {
        type: "dividend",
        amountCents,
        effectiveAt,
        positionId: row.position_id,
        symbol: row.symbol,
        source: "manual",
        importRef
      });
      const movement = cashRepository.findMovementByImportRef(userId, importRef);
      if (!movement) throw new Error(`Mouvement de dividende introuvable apres insertion (${importRef}).`);
      dividendProposalsRepository.changeStatus(userId, id, { from: "pending", to: "accepted", decidedAt: now.toISOString(), movementId: movement.id });
    });
    invalidateCashViews(userId);
    return { ledger: cashAccountService.ledger(userId), proposals: this.list(userId, now) };
  },

  /** Ignorer est réversible depuis « Mon PEA » (`restore`). */
  ignore(userId: number, id: number, now = new Date()): DividendProposalsDto {
    const row = requireProposal(userId, id);
    if (!dividendProposalsRepository.changeStatus(userId, row.id, { from: "pending", to: "ignored", decidedAt: now.toISOString() })) {
      throw new HttpError(409, proposalNotPendingMessage);
    }
    return this.list(userId, now);
  },

  restore(userId: number, id: number, now = new Date()): DividendProposalsDto {
    const row = requireProposal(userId, id);
    if (!dividendProposalsRepository.changeStatus(userId, row.id, { from: "ignored", to: "pending", decidedAt: null })) {
      throw new HttpError(409, proposalNotIgnoredMessage);
    }
    return this.list(userId, now);
  }
};
