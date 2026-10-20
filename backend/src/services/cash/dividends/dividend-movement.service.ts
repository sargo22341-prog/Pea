import type { CashLedgerDto, DividendProposalAcceptInput } from "@pea/shared";
import { cashAccountService } from "../cash-account.service.js";
import { invalidateCashViews } from "../cash-movements.service.js";
import { correctDividendMovement, requireDividendMovement } from "./dividend-credit.js";
import { verifyManually } from "./dividend-verification.js";

/** Actions sur un dividende enregistré (avec ou sans proposition) : vérifier, corriger. */
export const dividendMovementService = {
  verify(userId: number, movementId: number, now = new Date()): CashLedgerDto {
    if (verifyManually(userId, movementId, now)) invalidateCashViews(userId);
    return cashAccountService.ledger(userId);
  },

  correct(userId: number, movementId: number, input: DividendProposalAcceptInput, now = new Date()): CashLedgerDto {
    correctDividendMovement(userId, requireDividendMovement(userId, movementId), input, now);
    invalidateCashViews(userId);
    return cashAccountService.ledger(userId);
  }
};
