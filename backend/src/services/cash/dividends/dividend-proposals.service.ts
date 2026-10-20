import type { CashLedgerDto, DividendProposalAcceptInput, DividendProposalsDto, DividendSettings } from "@pea/shared";
import { cashRepository } from "../../../repositories/cash/cash.repository.js";
import { dividendProposalsRepository } from "../../../repositories/cash/dividend-proposals.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { logger } from "../../shared/logger.service.js";
import { cashAccountService } from "../cash-account.service.js";
import { invalidateCashViews } from "../cash-movements.service.js";
import { acceptProposal, correctProposal, proposalNotPendingMessage, requireProposal } from "./dividend-proposal-decisions.js";
import { isPaid, isRecent, isUnreadAutoAccepted, toProposal } from "./dividend-proposal-mapper.js";
import { syncDividendProposals } from "./dividend-proposals-sync.js";

export const proposalNotIgnoredMessage = "Cette proposition de dividende n'est pas ignoree.";

export interface DividendProposalDecision {
  ledger: CashLedgerDto;
  proposals: DividendProposalsDto;
}

/**
 * Ajout automatique, si l'utilisateur l'a activé : seuls les dividendes payés et sûrs (aucun
 * motif de vérification) sont crédités sans clic. Un refus (dividende déjà saisi entre-temps,
 * date antérieure à l'état initial) laisse la proposition à confirmer.
 */
function autoAcceptSure(userId: number, now: Date) {
  const account = cashAccountService.ensureAccount(userId);
  if (account.status !== "ready" || account.dividend_auto_accept !== 1) return 0;
  let accepted = 0;
  for (const row of dividendProposalsRepository.listForUser(userId)) {
    if (row.status !== "pending" || row.needs_review === 1 || !isPaid(row, now)) continue;
    try {
      acceptProposal(userId, row.id, {}, now, true);
      accepted += 1;
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      logger.warn("portfolio", "ajout automatique d'un dividende refuse, proposition laissee a confirmer", { userId, proposalId: row.id, reason: error.message });
    }
  }
  if (accepted) invalidateCashViews(userId);
  return accepted;
}

/**
 * Propositions de dividendes encaissés. Rien n'est crédité sans validation explicite, sauf les
 * dividendes sûrs quand l'ajout automatique est activé ; tout dividende enregistré reste corrigeable.
 */
export const dividendProposalsService = {
  /** Génère les propositions, applique l'ajout automatique et renvoie le nombre de dividendes ajoutés. */
  refresh(userId: number, now = new Date()) {
    syncDividendProposals(userId, now);
    return autoAcceptSure(userId, now);
  },

  list(userId: number, now = new Date()): DividendProposalsDto {
    this.refresh(userId, now);
    return this.read(userId, now);
  },

  /** Lecture seule, sans génération (après une décision déjà appliquée). */
  read(userId: number, now = new Date()): DividendProposalsDto {
    const account = cashAccountService.ensureAccount(userId);
    const rows = account.status === "ready" ? dividendProposalsRepository.listForUser(userId) : [];
    return {
      pending: rows.filter((row) => row.status === "pending" && isPaid(row, now)).map(toProposal),
      ignored: rows.filter((row) => row.status === "ignored").map(toProposal),
      recent: rows.filter((row) => isRecent(row, now)).map(toProposal),
      unreadAutoAccepted: rows.filter(isUnreadAutoAccepted).length,
      cash: cashAccountService.summary(userId).cash
    };
  },

  accept(userId: number, id: number, input: DividendProposalAcceptInput, now = new Date()): DividendProposalDecision {
    acceptProposal(userId, id, input, now);
    invalidateCashViews(userId);
    return { ledger: cashAccountService.ledger(userId), proposals: this.list(userId, now) };
  },

  correct(userId: number, id: number, input: DividendProposalAcceptInput, now = new Date()): DividendProposalDecision {
    correctProposal(userId, id, input, now);
    invalidateCashViews(userId);
    return { ledger: cashAccountService.ledger(userId), proposals: this.read(userId, now) };
  },

  /** Ignorer est réversible depuis « Mon PEA » (`restore`). */
  ignore(userId: number, id: number, now = new Date()): DividendProposalsDto {
    const row = requireProposal(userId, id);
    if (!dividendProposalsRepository.changeStatus(userId, row.id, { from: "pending", to: "ignored", decidedAt: now.toISOString() })) {
      throw new HttpError(409, proposalNotPendingMessage);
    }
    return this.read(userId, now);
  },

  restore(userId: number, id: number, now = new Date()): DividendProposalsDto {
    const row = requireProposal(userId, id);
    if (!dividendProposalsRepository.changeStatus(userId, row.id, { from: "ignored", to: "pending", decidedAt: null })) {
      throw new HttpError(409, proposalNotIgnoredMessage);
    }
    return this.list(userId, now);
  },

  markNotificationsRead(userId: number, now = new Date()): DividendProposalsDto {
    dividendProposalsRepository.markNotificationsRead(userId, now.toISOString());
    return this.read(userId, now);
  },

  settings(userId: number): DividendSettings {
    return { autoAccept: cashAccountService.ensureAccount(userId).dividend_auto_accept === 1 };
  },

  /** Activer l'ajout automatique crédite aussi, à la prochaine lecture, les dividendes sûrs déjà en attente. */
  updateSettings(userId: number, settings: DividendSettings): DividendSettings {
    cashAccountService.ensureAccount(userId);
    cashRepository.setDividendAutoAccept(userId, settings.autoAccept);
    return this.settings(userId);
  }
};
