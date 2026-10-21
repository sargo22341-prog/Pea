import type { DividendStatementRefundCase, DividendStatementRefundPreview } from "@pea/shared";
import { db } from "../../../db.js";
import { cashRepository, type CashMovementRow } from "../../../repositories/cash/cash.repository.js";
import type { StatementPositionRow } from "../../../repositories/cash/dividend-verification.repository.js";
import { centsToMoney, entryTimeMs, isAbsorbed } from "../cash-ledger.js";
import { hasNearbyOtherAmount, otherCreditCandidates, type DocumentCredit } from "../credits/other-credit-matching.js";
import { certifyMovement, verificationInfo } from "../dividends/dividend-verification.js";
import type { ParsedStatementRefund } from "./parser/statement-parser.js";
import { STATEMENT_IMPORT_REF_PREFIX } from "./statement-apply.js";
import { lineEffectiveAt, positionForIsin, type StatementContext } from "./statement-reconciliation.js";

export type RefundOutcome = "created" | "certified" | "alreadyCertified" | "skipped";

export interface RefundClassification {
  case: DividendStatementRefundCase;
  beforeStart: boolean;
  position?: StatementPositionRow | undefined;
  movement?: CashMovementRow | undefined;
  candidates: CashMovementRow[];
  possibleDuplicate: boolean;
}

/** Référence d'un remboursement, sans donnée personnelle : `AAAA-MM#R<ligne>`. */
export function refundReference(period: string, lineNo: number) {
  return `${period}#R${String(lineNo)}`;
}

function documentCredit(context: StatementContext, period: string, refund: ParsedStatementRefund): DocumentCredit {
  return {
    type: "capital_repayment",
    amountCents: refund.amountCents,
    effectiveAt: lineEffectiveAt(refund.paymentDate),
    positionId: positionForIsin(context.positions, refund.isin)?.id,
    reference: refundReference(period, refund.lineNo)
  };
}

/**
 * Rapprochement d'un remboursement (règles pures, sans écriture). Un remboursement antérieur à
 * l'état initial est rapproché ou créé comme les autres : résumé par l'état initial, il ne change
 * pas le solde mais est déduit du calcul des dividendes déjà perçus.
 */
export function classifyRefund(context: StatementContext, period: string, refund: ParsedStatementRefund): RefundClassification {
  const credit = documentCredit(context, period, refund);
  const position = positionForIsin(context.positions, refund.isin);
  const beforeStart = isAbsorbed(credit.effectiveAt, context.account.reference_at ?? undefined);
  const base = { beforeStart, position, candidates: [], possibleDuplicate: false };
  const importRef = `${STATEMENT_IMPORT_REF_PREFIX}${credit.reference}`;
  const recorded = context.credits.find((movement) => movement.import_ref === importRef || (movement.verification === "document" && movement.verification_ref === credit.reference));
  if (recorded) return { ...base, case: "already_certified", movement: recorded };
  if (entryTimeMs(credit.effectiveAt) > context.now.getTime()) return { ...base, case: "future" };
  const candidates = otherCreditCandidates(context.credits, credit);
  if (candidates.length > 1) return { ...base, case: "ambiguous", candidates };
  const [movement] = candidates;
  if (movement) return { ...base, case: "certify", movement };
  return { ...base, case: "create", possibleDuplicate: hasNearbyOtherAmount(context.credits, credit) };
}

function movementRef(movement: CashMovementRow) {
  return { id: movement.id, amount: centsToMoney(movement.amount_cents), effectiveAt: movement.effective_at, verification: verificationInfo(movement) };
}

export function refundPreview(context: StatementContext, period: string, refund: ParsedStatementRefund): DividendStatementRefundPreview {
  const classification = classifyRefund(context, period, refund);
  const { position } = classification;
  return {
    lineNo: refund.lineNo,
    paymentDate: refund.paymentDate,
    name: refund.name,
    isin: refund.isin,
    quantity: refund.quantity,
    gross: centsToMoney(refund.grossCents),
    amount: centsToMoney(refund.amountCents),
    key: refundReference(period, refund.lineNo),
    case: classification.case,
    beforeStart: classification.beforeStart,
    position: position ? { id: position.id, symbol: position.symbol, name: position.name } : undefined,
    movement: classification.movement ? movementRef(classification.movement) : undefined,
    candidates: classification.candidates.length ? classification.candidates.map(movementRef) : undefined,
    possibleDuplicate: classification.possibleDuplicate || undefined
  };
}

/**
 * Applique un remboursement confirmé, dans une transaction, après avoir recalculé son
 * rapprochement sur l'état courant. Un cas ambigu n'est appliqué qu'au mouvement choisi par
 * l'utilisateur, s'il fait toujours partie des candidats. La référence d'import unique interdit
 * une seconde création, quel que soit l'ordre des imports.
 */
export function applyRefund(userId: number, context: StatementContext, period: string, refund: ParsedStatementRefund, movementId?: number): RefundOutcome {
  return db.transaction((): RefundOutcome => {
    const classification = classifyRefund(context, period, refund);
    const reference = refundReference(period, refund.lineNo);
    switch (classification.case) {
      case "already_certified":
        return "alreadyCertified";
      case "certify":
      case "ambiguous": {
        const target = classification.case === "certify" ? classification.movement : classification.candidates.find((candidate) => candidate.id === movementId);
        if (!target) return "skipped";
        certifyMovement(userId, target.id, reference, context.now);
        return "certified";
      }
      case "create": {
        const { position } = classification;
        const importRef = `${STATEMENT_IMPORT_REF_PREFIX}${reference}`;
        cashRepository.insertMovement(userId, {
          type: "capital_repayment",
          amountCents: refund.amountCents,
          effectiveAt: lineEffectiveAt(refund.paymentDate),
          positionId: position?.id,
          symbol: position?.symbol,
          source: "pdf",
          importRef,
          // Sans position, l'ISIN et le nom lu sur le relevé identifient la valeur.
          note: position ? null : `${refund.name} (${refund.isin})`
        });
        const created = cashRepository.findMovementByImportRef(userId, importRef);
        if (!created) throw new Error(`Remboursement introuvable apres insertion (${importRef}).`);
        certifyMovement(userId, created.id, reference, context.now);
        return "created";
      }
      default:
        return "skipped";
    }
  });
}
