import type { CashStatementContinuity, CashStatementLinePreview, CashStatementPreview } from "@pea/shared";
import { centsToMoney } from "../cash-ledger.js";
import type { ParsedCashStatement, ParsedCashStatementLine } from "./parser/cash-statement-parser.js";
import type { LineClassification } from "./statement-classification.js";
import { targetDto } from "./statement-context.js";
import { lineKey } from "./statement-keys.js";

/** Mise en forme de l'aperçu d'un relevé (montants en euros, sans donnée personnelle). */

function linePreview(period: string, line: ParsedCashStatementLine, classification: LineClassification | undefined): CashStatementLinePreview {
  return {
    lineNo: line.lineNo,
    operationDate: line.operationDate,
    valueDate: line.valueDate,
    kind: line.kind,
    label: line.label,
    amount: centsToMoney(line.amountCents),
    quantity: line.quantity,
    name: line.name,
    couponDate: line.couponDate,
    key: lineKey(period, line.lineNo),
    case: classification?.case ?? "neutral",
    target: classification?.target ? targetDto(classification.target) : undefined,
    candidates: classification?.candidates.length ? classification.candidates.map(targetDto) : undefined,
    beforeStart: classification?.beforeStart ?? false
  };
}

export function statementPreview(
  fileName: string,
  statement: ParsedCashStatement,
  classifications: ReadonlyMap<string, LineClassification>,
  continuity: CashStatementContinuity | undefined,
  alreadyImported: boolean
): CashStatementPreview {
  return {
    fileName,
    period: statement.period,
    format: statement.format,
    openingDate: statement.openingDate,
    closingDate: statement.closingDate,
    openingBalance: centsToMoney(statement.openingCents),
    closingBalance: centsToMoney(statement.closingCents),
    alreadyImported: alreadyImported || undefined,
    continuity,
    lines: statement.lines.map((line) => linePreview(statement.period, line, classifications.get(lineKey(statement.period, line.lineNo))))
  };
}

export function rejectedPreview(fileName: string, error: string, period?: string): CashStatementPreview {
  return { fileName, period, error, lines: [] };
}
