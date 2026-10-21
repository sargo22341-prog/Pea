import { FULL_HISTORY_INELIGIBLE_CODE, FULL_HISTORY_MISMATCH_CODE, type CashLedgerDto, type FullHistoryCreation, type FullHistoryPreview, type FullHistoryTotals } from "@pea/shared";
import { db } from "../../../db.js";
import { cashRepository } from "../../../repositories/cash/cash.repository.js";
import { cashStatementsRepository } from "../../../repositories/cash/cash-statements.repository.js";
import { dividendVerificationRepository } from "../../../repositories/cash/dividend-verification.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { cashAccountService, type LoadedLedger } from "../cash-account.service.js";
import { centsToMoney, computeLedger, type LedgerItem, type LedgerResult } from "../cash-ledger.js";
import { invalidateCashViews } from "../cash-movements.service.js";
import { monthlyCheck } from "../cash-statements/monthly-check/monthly-check.service.js";
import { CASH_STATEMENT_IMPORT_REF_PREFIX, lineKey } from "../cash-statements/statement-keys.js";
import { STATEMENT_IMPORT_REF_PREFIX } from "../dividend-statements/statement-apply.js";
import { lineEffectiveAt, parisDay } from "../dividend-statements/statement-reconciliation.js";
import { statementReference } from "../dividends/dividend-verification.js";
import { planFullHistory, type CreationStep, type DividendConversionStep, type FullHistoryContext, type FullHistoryPlan } from "./full-history-plan.js";

export const fullHistoryIneligibleMessage = "Le passage en historique complet n'est pas possible : des relevés ou des opérations manquent.";
export const fullHistoryMismatchMessage = "Le passage en historique complet a été annulé : le solde d'un mois ne correspond plus au relevé espèces.";

function loadContext(userId: number): FullHistoryContext {
  return {
    account: cashAccountService.ensureAccount(userId),
    statements: cashStatementsRepository.listStatements(userId),
    lines: cashStatementsRepository.listLines(userId),
    trades: cashRepository.listTrades(userId),
    movements: cashRepository.listMovements(userId),
    dividendLines: dividendVerificationRepository.listStatementLines(userId),
    positions: dividendVerificationRepository.listPositions(userId)
  };
}

function totals(result: Pick<LedgerResult, "balanceCents" | "depositsCents" | "withdrawalsCents" | "dividendsCents" | "otherCreditsCents">): FullHistoryTotals {
  return {
    cash: centsToMoney(result.balanceCents),
    deposits: centsToMoney(result.depositsCents),
    withdrawals: centsToMoney(result.withdrawalsCents),
    cashDividends: centsToMoney(result.dividendsCents),
    otherCredits: centsToMoney(result.otherCreditsCents)
  };
}

/** Journal rejoué sans état initial, avec les mouvements que le passage créerait. */
function simulate(loaded: LoadedLedger, plan: FullHistoryPlan) {
  const existing: LedgerItem[] = loaded.result.entries.flatMap((entry) => entry.item ? [entry.item] : []);
  const planned: LedgerItem[] = [
    ...plan.creations.map((step, index): LedgerItem => ({ id: `planned:${String(index)}`, kind: step.line.kind, effectiveAt: step.effectiveAt, amountCents: step.line.amount_cents, sequence: Number.MAX_SAFE_INTEGER, source: "pdf" })),
    ...plan.conversions.map((step): LedgerItem => ({ id: `statement-line:${String(step.dividendLine.id)}`, kind: "dividend", effectiveAt: lineEffectiveAt(step.dividendLine.payment_date), amountCents: step.dividendLine.net_cents, sequence: Number.MAX_SAFE_INTEGER, source: "pdf" }))
  ];
  return computeLedger({ openingCashCents: 0, openingDepositsCents: 0, openingWithdrawalsCents: 0 }, [...existing, ...planned]);
}

function creationSummary(creations: readonly CreationStep[]): FullHistoryCreation[] {
  const byKind = new Map<FullHistoryCreation["kind"], { count: number; cents: number }>();
  for (const { line } of creations) {
    const current = byKind.get(line.kind) ?? { count: 0, cents: 0 };
    byKind.set(line.kind, { count: current.count + 1, cents: current.cents + Math.abs(line.amount_cents) });
  }
  return [...byKind].map(([kind, value]) => ({ kind, count: value.count, amount: centsToMoney(value.cents) }));
}

function insertMovementId(userId: number, input: Parameters<typeof cashRepository.insertMovement>[1] & { importRef: string }) {
  cashRepository.insertMovement(userId, input);
  const created = cashRepository.findMovementByImportRef(userId, input.importRef);
  if (!created) throw new Error(`Mouvement introuvable apres insertion (${input.importRef}).`);
  return created.id;
}

/** Ligne résumée par l'état initial : le mouvement réel est créé et vérifié par cette ligne. */
function createFromLine(userId: number, step: CreationStep, now: Date) {
  const { line } = step;
  const key = lineKey(line.period, line.line_no);
  const note = line.kind === "capital_repayment" || line.kind === "compensation" ? line.name : null;
  const movementId = insertMovementId(userId, { type: line.kind, amountCents: Math.abs(line.amount_cents), effectiveAt: step.effectiveAt, source: "pdf", importRef: `${CASH_STATEMENT_IMPORT_REF_PREFIX}${key}`, note });
  if (!cashStatementsRepository.link(userId, line.period, line.line_no, { movementId }, now.toISOString())) throw new HttpError(409, `La ligne ${key} du relevé espèces est déjà rapprochée.`);
}

/**
 * Dividende d'avant la date de départ certifié par relevé de coupons : il devient un mouvement
 * certifié (même référence d'import qu'un dividende créé par ce relevé : un réimport ne le double
 * pas), la ligne du relevé espèces le vérifie et la ligne de coupons, désormais inutile, disparaît.
 */
function convertDividendLine(userId: number, step: DividendConversionStep) {
  const { dividendLine, position } = step;
  const reference = statementReference(dividendLine.period, dividendLine.line_no);
  const movementId = insertMovementId(userId, { type: "dividend", amountCents: dividendLine.net_cents, effectiveAt: lineEffectiveAt(dividendLine.payment_date), positionId: position.id, symbol: position.symbol, source: "pdf", importRef: `${STATEMENT_IMPORT_REF_PREFIX}${reference}` });
  dividendVerificationRepository.setVerification(userId, movementId, "document", dividendLine.certified_at, reference);
  if (!cashStatementsRepository.relinkDividendLine(userId, dividendLine.id, movementId)) throw new HttpError(409, `La ligne de coupons ${reference} n'est plus rapprochée du relevé espèces.`);
  dividendVerificationRepository.deleteStatementLine(userId, dividendLine.id);
}

/** Mois clos au plus tard le jour de l'ancienne date de départ qui ne bouclent pas une fois l'historique rejoué. */
function mismatchedPeriods(userId: number, referenceAt: string, now: Date) {
  const referenceDay = parisDay(referenceAt);
  return monthlyCheck(userId, now).months
    .filter((month) => month.closingDate !== undefined && month.closingDate <= referenceDay && month.status !== "ok")
    .map((month) => month.period);
}

export const fullHistoryService = {
  preview(userId: number): FullHistoryPreview {
    const context = loadContext(userId);
    const plan = planFullHistory(context);
    const loaded = cashAccountService.load(userId);
    const periods = context.statements.map((statement) => statement.period).sort();
    const eligible = plan.blockers.length === 0;
    const simulated = eligible ? simulate(loaded, plan) : undefined;
    return {
      eligible,
      blockers: plan.blockers,
      referenceAt: plan.referenceAt,
      firstPeriod: periods[0],
      lastPeriod: periods.at(-1),
      statements: periods.length,
      creations: creationSummary(plan.creations),
      dividends: { count: plan.conversions.length, amount: centsToMoney(plan.conversions.reduce((sum, step) => sum + step.dividendLine.net_cents, 0)) },
      before: totals(loaded.result),
      after: simulated ? totals(simulated) : undefined,
      negativeBalanceAt: simulated?.firstNegativeAt
    };
  },

  /**
   * Passage confirmé, dans une seule transaction : le plan est recalculé sur l'état courant, les
   * mouvements réels sont créés et vérifiés, l'état initial supprimé et la révision tracée. Si un
   * mois clos avant l'ancienne date de départ ne boucle pas ensuite, tout est annulé.
   */
  complete(userId: number, now = new Date()): CashLedgerDto {
    db.transaction(() => {
      const context = loadContext(userId);
      const plan = planFullHistory(context);
      if (plan.blockers.length || plan.referenceAt === undefined) {
        throw new HttpError(409, fullHistoryIneligibleMessage, { code: FULL_HISTORY_INELIGIBLE_CODE, blockers: plan.blockers });
      }
      for (const step of plan.creations) createFromLine(userId, step, now);
      for (const step of plan.conversions) convertDividendLine(userId, step);
      cashRepository.completeHistory(userId, { formerReferenceAt: plan.referenceAt, openedAt: plan.openedAt, at: now.toISOString() });
      const periods = mismatchedPeriods(userId, plan.referenceAt, now);
      if (periods.length) throw new HttpError(409, fullHistoryMismatchMessage, { code: FULL_HISTORY_MISMATCH_CODE, periods });
      const next = cashAccountService.ensureAccount(userId);
      cashRepository.insertRevision(userId, cashAccountService.settings(context.account), {
        ...cashAccountService.settings(next),
        fullHistory: { createdMovements: plan.creations.length, convertedDividends: plan.conversions.length }
      });
    });
    invalidateCashViews(userId);
    return cashAccountService.ledger(userId);
  }
};
