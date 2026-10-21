import type { DividendStatementLinePreview, DividendStatementPreview } from "@pea/shared";
import { cashRepository, type CashMovementRow } from "../../../repositories/cash/cash.repository.js";
import { dividendProposalsRepository } from "../../../repositories/cash/dividend-proposals.repository.js";
import { dividendVerificationRepository } from "../../../repositories/cash/dividend-verification.repository.js";
import { centsToMoney } from "../cash-ledger.js";
import { requireReadyAccount } from "../dividends/dividend-credit.js";
import { statementReference, verificationInfo } from "../dividends/dividend-verification.js";
import type { ParsedDividendStatement, ParsedStatementLine } from "./parser/statement-parser.js";
import { refundPreview } from "./statement-refunds.js";
import { classifyLine, compareWithholding, type LineClassification, type StatementContext } from "./statement-reconciliation.js";

/** État du compte nécessaire au rapprochement ; un compte espèces non configuré est refusé (409). */
export function loadStatementContext(userId: number, now: Date): StatementContext {
  const account = requireReadyAccount(userId);
  const movements = cashRepository.listMovements(userId);
  return {
    account,
    positions: dividendVerificationRepository.listPositions(userId),
    movements: movements.filter((movement) => movement.type === "dividend"),
    credits: movements.filter((movement) => movement.type === "capital_repayment"),
    proposals: dividendProposalsRepository.listForUser(userId).filter((row) => row.status !== "accepted"),
    statementLines: dividendVerificationRepository.listStatementLines(userId),
    now
  };
}

export function lineKey(period: string, lineNo: number) {
  return statementReference(period, lineNo);
}

export function lineDto(line: ParsedStatementLine) {
  return {
    lineNo: line.lineNo,
    paymentDate: line.paymentDate,
    quantity: line.quantity,
    name: line.name,
    isin: line.isin,
    gross: centsToMoney(line.grossCents),
    withholding: centsToMoney(line.withholdingCents),
    netFiscal: centsToMoney(line.netFiscalCents),
    commission: centsToMoney(line.commissionCents),
    net: centsToMoney(line.netCents)
  };
}

function movementDto(movement: CashMovementRow) {
  return { id: movement.id, amount: centsToMoney(movement.amount_cents), effectiveAt: movement.effective_at, verification: verificationInfo(movement) };
}

export function linePreview(period: string, line: ParsedStatementLine, classification: LineClassification): DividendStatementLinePreview {
  const { position } = classification;
  return {
    ...lineDto(line),
    key: lineKey(period, line.lineNo),
    case: classification.case,
    position: position ? { id: position.id, symbol: position.symbol, name: position.name } : undefined,
    movement: classification.movement ? movementDto(classification.movement) : undefined,
    proposalId: classification.proposal?.id,
    withholdingCheck: position ? compareWithholding(line, position.symbol) : undefined,
    possibleDuplicate: classification.possibleDuplicate || undefined
  };
}

export function statementPreview(context: StatementContext, fileName: string, statement: ParsedDividendStatement): DividendStatementPreview {
  return {
    fileName,
    period: statement.period,
    lines: statement.lines.map((line) => linePreview(statement.period, line, classifyLine(context, statement.period, line))),
    refunds: statement.refunds.map((refund) => refundPreview(context, statement.period, refund)),
    totalNet: centsToMoney(statement.totalNetCents)
  };
}
