import { db } from "../../../db.js";
import { cashRepository } from "../../../repositories/cash/cash.repository.js";
import { dividendProposalsRepository } from "../../../repositories/cash/dividend-proposals.repository.js";
import type { StatementPositionRow } from "../../../repositories/cash/dividend-verification.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { positionIsinService } from "../../portfolio/holdings/position-isin.service.js";
import { centsToMoney } from "../cash-ledger.js";
import { correctDividendMovement } from "../dividends/dividend-credit.js";
import { acceptProposal } from "../dividends/dividend-proposal-decisions.js";
import { certifyMovement, statementReference } from "../dividends/dividend-verification.js";
import type { ParsedStatementLine } from "./parser/statement-parser.js";
import { classifyLine, lineEffectiveAt, type StatementContext } from "./statement-reconciliation.js";

export type AppliedOutcome = "certified" | "corrected" | "created" | "alreadyCertified" | "opening" | "skipped";

export const positionHasOtherIsinMessage = "Cette position a déjà un autre ISIN : choisissez la position qui correspond à la ligne du relevé.";

/** Préfixe de la référence d'import d'un dividende créé depuis un relevé (unique par utilisateur). */
export const STATEMENT_IMPORT_REF_PREFIX = "statement:";

/** Position choisie pour un ISIN inconnu : elle doit appartenir à l'utilisateur et l'ISIN y est enregistré. */
function choosePosition(context: StatementContext, userId: number, positionId: number, isin: string): StatementPositionRow {
  const position = context.positions.find((row) => row.id === positionId);
  if (!position) throw new HttpError(404, "Position introuvable");
  if (position.isin && position.isin.toUpperCase() !== isin) throw new HttpError(409, positionHasOtherIsinMessage);
  if (!position.isin) positionIsinService.set(userId, position.id, isin);
  return { ...position, isin };
}

/**
 * Applique une ligne confirmée, dans une transaction : mouvement, statut de proposition et
 * certification sont écrits ensemble ou pas du tout. Le rapprochement est recalculé sur l'état
 * courant : l'aperçu ne fait jamais foi pour l'écriture.
 */
export function applyStatementLine(userId: number, context: StatementContext, period: string, line: ParsedStatementLine, positionId?: number): AppliedOutcome {
  return db.transaction((): AppliedOutcome => {
    const chosen = positionId === undefined ? undefined : choosePosition(context, userId, positionId, line.isin);
    const classification = classifyLine(context, period, line, chosen);
    const reference = statementReference(period, line.lineNo);
    const effectiveAt = lineEffectiveAt(line.paymentDate);
    const credit = { amount: centsToMoney(line.netCents), effectiveAt };
    const { position, movement, proposal } = classification;

    switch (classification.case) {
      case "certify":
        if (movement) certifyMovement(userId, movement.id, reference, context.now);
        return "certified";
      case "mismatch":
        if (!movement) return "skipped";
        correctDividendMovement(userId, movement, { ...credit, confirmUncertify: true, confirmUnverify: true }, context.now);
        certifyMovement(userId, movement.id, reference, context.now);
        return "corrected";
      case "proposal": {
        if (!proposal) return "skipped";
        if (proposal.status === "ignored") dividendProposalsRepository.changeStatus(userId, proposal.id, { from: "ignored", to: "pending", decidedAt: null });
        certifyMovement(userId, acceptProposal(userId, proposal.id, credit, context.now), reference, context.now);
        return "certified";
      }
      case "create": {
        if (!position) return "skipped";
        const importRef = `${STATEMENT_IMPORT_REF_PREFIX}${reference}`;
        cashRepository.insertMovement(userId, { type: "dividend", amountCents: line.netCents, effectiveAt, positionId: position.id, symbol: position.symbol, source: "pdf", importRef });
        const created = cashRepository.findMovementByImportRef(userId, importRef);
        if (!created) throw new Error(`Mouvement de dividende introuvable apres insertion (${importRef}).`);
        certifyMovement(userId, created.id, reference, context.now);
        return "created";
      }
      case "already_certified":
        return "alreadyCertified";
      case "opening":
        return "opening";
      default:
        return "skipped";
    }
  });
}
