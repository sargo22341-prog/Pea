import type { CashStatementLineDecision } from "@pea/shared";
import { db } from "../../../db.js";
import { cashRepository, type CashMovementInsert } from "../../../repositories/cash/cash.repository.js";
import { cashStatementsRepository, type CashStatementLink } from "../../../repositories/cash/cash-statements.repository.js";
import { dividendProposalsRepository } from "../../../repositories/cash/dividend-proposals.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { withCashGuard } from "../cash-guard.js";
import { centsToMoney } from "../cash-ledger.js";
import { acceptProposal } from "../dividends/dividend-proposal-decisions.js";
import { isSameDividendCredit } from "../dividends/dividend-proposal-rules.js";
import type { MatchElement } from "./matching/line-matching.js";
import type { ParsedCashStatementLine } from "./parser/cash-statement-parser.js";
import { classifyBatch, type BatchLine } from "./statement-classification.js";
import { createdEffectiveAt, loadCashStatementContext, type CashStatementContext } from "./statement-context.js";
import { CASH_STATEMENT_IMPORT_REF_PREFIX, lineKey } from "./statement-keys.js";

/** `none` : ligne sans rapprochement attendu (reprise de solde, versement résumé par l'état initial). */
export type CashLineOutcome = "verified" | "created" | "alreadyVerified" | "unmatched" | "none";

export const couponPositionRequiredMessage = "Choisissez la position de ce coupon : le relevé espèces ne donne pas son ISIN.";
export const dividendNearbyMessage = "Un dividende de cette valeur est déjà enregistré à une date proche : corrigez-le plutôt que d'en créer un second.";
export const lineAlreadyLinkedMessage = "Cette ligne de relevé est déjà rapprochée d'un autre élément.";

function elementLink(id: string): CashStatementLink {
  const [prefix, raw] = id.split(":");
  const numeric = Number(raw);
  if (prefix === "transaction") return { transactionId: numeric };
  if (prefix === "movement") return { movementId: numeric };
  return { dividendLineId: numeric };
}

function link(userId: number, period: string, line: ParsedCashStatementLine, target: MatchElement | CashStatementLink, now: Date) {
  const reference = "id" in target ? elementLink(target.id) : target;
  if (!cashStatementsRepository.link(userId, period, line.lineNo, reference, now.toISOString())) throw new HttpError(409, lineAlreadyLinkedMessage);
}

function insertMovement(userId: number, input: CashMovementInsert) {
  cashRepository.insertMovement(userId, input);
  const created = input.importRef ? cashRepository.findMovementByImportRef(userId, input.importRef) : undefined;
  if (!created) throw new Error(`Mouvement introuvable apres insertion (${input.importRef ?? ""}).`);
  return created.id;
}

/**
 * Coupon sans dividende enregistré : la position est choisie par l'utilisateur (aucun ISIN sur le
 * relevé espèces). Une proposition de dividende de cette position est validée au montant du relevé
 * plutôt que doublée ; un autre dividende proche de la même valeur refuse la création.
 */
function createDividend(userId: number, context: CashStatementContext, line: ParsedCashStatementLine, base: CashMovementInsert, positionId: number | undefined) {
  const position = context.positions.find((row) => row.id === positionId);
  if (!position) throw new HttpError(400, couponPositionRequiredMessage);
  const credit = { symbol: position.symbol, effectiveAt: base.effectiveAt };
  if (context.movements.some((movement) => movement.type === "dividend" && isSameDividendCredit({ symbol: movement.symbol, effectiveAt: movement.effective_at }, credit))) {
    throw new HttpError(409, dividendNearbyMessage);
  }
  const proposal = context.proposals.find((row) => isSameDividendCredit({ symbol: row.symbol, effectiveAt: row.payment_at }, credit));
  if (!proposal) return insertMovement(userId, { ...base, positionId: position.id, symbol: position.symbol });
  if (proposal.status === "ignored") dividendProposalsRepository.changeStatus(userId, proposal.id, { from: "ignored", to: "pending", decidedAt: null });
  return acceptProposal(userId, proposal.id, { amount: centsToMoney(line.amountCents), effectiveAt: base.effectiveAt }, context.now);
}

/** Crée l'élément absent de l'application ; un débit passe par le contrôle des fonds. */
function createElement(userId: number, context: CashStatementContext, period: string, line: ParsedCashStatementLine, decision: CashStatementLineDecision) {
  const amountCents = Math.abs(line.amountCents);
  const effectiveAt = createdEffectiveAt(line);
  const importRef = `${CASH_STATEMENT_IMPORT_REF_PREFIX}${lineKey(period, line.lineNo)}`;
  switch (line.kind) {
    case "deposit":
      return insertMovement(userId, { type: "deposit", amountCents, effectiveAt, source: "pdf", importRef });
    case "withdrawal":
    case "fee": {
      const type = line.kind;
      return withCashGuard(userId, { effectiveAt, requiredCents: amountCents, fundable: false }, () => insertMovement(userId, { type, amountCents, effectiveAt, source: "pdf", importRef }));
    }
    case "capital_repayment":
    case "compensation":
      // Le nom abrégé du relevé identifie la valeur pour l'utilisateur (jamais un critère de rapprochement).
      return insertMovement(userId, { type: line.kind, amountCents, effectiveAt, source: "pdf", importRef, note: line.name ?? null });
    case "dividend":
      return createDividend(userId, context, line, { type: "dividend", amountCents, effectiveAt, source: "pdf", importRef }, decision.positionId);
    default:
      throw new HttpError(400, "Cette ligne ne crée aucun élément.");
  }
}

/**
 * Applique une ligne confirmée, dans une transaction : le rapprochement est recalculé sur l'état
 * courant (l'aperçu ne fait jamais foi), l'élément éventuellement créé et le lien sont écrits
 * ensemble ou pas du tout. Une ligne ambiguë n'est rapprochée que de l'élément choisi, s'il fait
 * toujours partie des candidats.
 */
export function applyCashLine(userId: number, batch: readonly BatchLine[], period: string, line: ParsedCashStatementLine, decision: CashStatementLineDecision | undefined, now: Date): CashLineOutcome {
  return db.transaction((): CashLineOutcome => {
    const context = loadCashStatementContext(userId, now);
    const classification = classifyBatch(context, batch).get(lineKey(period, line.lineNo));
    if (!classification) return "unmatched";
    if (classification.case === "already_verified") return "alreadyVerified";
    if (classification.case === "neutral" || classification.case === "opening") return "none";
    if (!decision?.apply) return "unmatched";
    switch (classification.case) {
      case "verify":
      case "ambiguous": {
        const target = classification.target ?? classification.candidates.find((candidate) => candidate.id === decision.targetId);
        if (!target) return "unmatched";
        link(userId, period, line, target, now);
        return "verified";
      }
      case "create":
        link(userId, period, line, { movementId: createElement(userId, context, period, line, decision) }, now);
        return "created";
      default:
        return "unmatched";
    }
  });
}
