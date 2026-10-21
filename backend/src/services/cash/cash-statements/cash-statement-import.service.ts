import type { CashStatementPreview, CashStatementsConfirmInput, CashStatementsImportResult, CashStatementsPreviewDto } from "@pea/shared";
import { db } from "../../../db.js";
import { cashStatementsRepository, type CashStatementLineRow, type CashStatementRow } from "../../../repositories/cash/cash-statements.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { invalidateCashViews } from "../cash-movements.service.js";
import type { ReadCashStatement } from "./cash-statement-file.js";
import type { ParsedCashStatement } from "./parser/cash-statement-parser.js";
import { applyCashLine } from "./statement-apply.js";
import { classifyBatch, type BatchLine } from "./statement-classification.js";
import { loadCashStatementContext } from "./statement-context.js";
import { lineKey } from "./statement-keys.js";
import { batchContinuity, type StatementBalances } from "./statement-continuity.js";
import { rejectedPreview, statementPreview } from "./statement-preview.js";

export const duplicateInBatchMessage = "Relevé en double dans le lot : ce mois n'est lu qu'une fois.";
export const otherContentMessage = "Un autre relevé de ce mois est déjà importé, avec un contenu différent : rien n'est importé.";

interface ValidStatement {
  fileName: string;
  statement: ParsedCashStatement;
  alreadyImported: boolean;
}

/**
 * Relevés lisibles, un seul par mois et par lot. Un mois déjà importé à l'identique (même
 * empreinte) est relu sans rien recréer ; avec un autre contenu, il est refusé.
 */
function splitStatements(reads: readonly ReadCashStatement[], stored: readonly CashStatementRow[]) {
  const valid: ValidStatement[] = [];
  const rejected: CashStatementPreview[] = [];
  for (const read of reads) {
    if (read.error !== undefined) {
      rejected.push(rejectedPreview(read.fileName, read.error));
      continue;
    }
    const { period, fingerprint } = read.statement;
    const previous = stored.find((row) => row.period === period);
    if (valid.some((row) => row.statement.period === period)) rejected.push(rejectedPreview(read.fileName, duplicateInBatchMessage, period));
    else if (previous && previous.fingerprint !== fingerprint) rejected.push(rejectedPreview(read.fileName, otherContentMessage, period));
    else valid.push({ fileName: read.fileName, statement: read.statement, alreadyImported: previous !== undefined });
  }
  valid.sort((a, b) => a.statement.period.localeCompare(b.statement.period));
  return { valid, rejected };
}

function batchLines(statements: readonly ValidStatement[]): BatchLine[] {
  return statements.flatMap(({ statement }) => statement.lines.map((line) => ({ period: statement.period, line })));
}

function storedBalances(statements: readonly CashStatementRow[], lines: readonly CashStatementLineRow[]): StatementBalances[] {
  return statements.map((row) => ({
    period: row.period,
    openingCents: row.opening_cents,
    closingCents: row.closing_cents,
    transferCents: lines.filter((line) => line.period === row.period && line.kind === "balance_transfer").reduce((sum, line) => sum + line.amount_cents, 0)
  }));
}

function parsedBalances(statement: ParsedCashStatement): StatementBalances {
  const transferCents = statement.lines.filter((line) => line.kind === "balance_transfer").reduce((sum, line) => sum + line.amountCents, 0);
  return { period: statement.period, openingCents: statement.openingCents, closingCents: statement.closingCents, transferCents };
}

/** Enregistre le relevé et ses lignes (réimport sans effet) ; vrai pour un relevé nouveau. */
function storeStatement(userId: number, statement: ParsedCashStatement, now: Date) {
  return db.transaction(() => {
    const importedAt = now.toISOString();
    const created = cashStatementsRepository.insertStatement(userId, statement, importedAt);
    for (const line of statement.lines) cashStatementsRepository.insertLine(userId, statement.period, line, importedAt);
    return created;
  });
}

/**
 * Import des relevés espèces : un aperçu sans écriture, puis une confirmation qui relit les mêmes
 * fichiers (rien n'est cru du client), enregistre les relevés et n'applique que les lignes
 * choisies, chacune dans sa transaction, après recalcul sur l'état courant.
 */
export const cashStatementsService = {
  preview(userId: number, reads: readonly ReadCashStatement[], now = new Date()): CashStatementsPreviewDto {
    const context = loadCashStatementContext(userId, now);
    const { valid, rejected } = splitStatements(reads, context.statements);
    const classifications = classifyBatch(context, batchLines(valid));
    const continuity = batchContinuity(valid.map(({ statement }) => parsedBalances(statement)), storedBalances(context.statements, context.lines));
    return {
      statements: [
        ...valid.map(({ fileName, statement, alreadyImported }) => statementPreview(fileName, statement, classifications, continuity.get(statement.period), alreadyImported)),
        ...rejected
      ],
      positions: context.positions.map((position) => ({ id: position.id, symbol: position.symbol, name: position.name }))
    };
  },

  confirm(userId: number, reads: readonly ReadCashStatement[], input: CashStatementsConfirmInput, now = new Date()): CashStatementsImportResult {
    const { valid, rejected } = splitStatements(reads, loadCashStatementContext(userId, now).statements);
    const result: CashStatementsImportResult = { statements: 0, verified: 0, created: 0, alreadyVerified: 0, unmatched: 0, errors: rejected.map((row) => ({ fileName: row.fileName, message: row.error ?? "" })) };
    for (const { statement } of valid) if (storeStatement(userId, statement, now)) result.statements += 1;
    const decisions = new Map(input.lines.map((decision) => [decision.key, decision]));
    const batch = batchLines(valid);
    for (const { fileName, statement } of valid) {
      for (const line of statement.lines) {
        try {
          const outcome = applyCashLine(userId, batch, statement.period, line, decisions.get(lineKey(statement.period, line.lineNo)), now);
          if (outcome !== "none") result[outcome] += 1;
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          result.unmatched += 1;
          result.errors.push({ fileName, lineNo: line.lineNo, message: error.message });
        }
      }
    }
    invalidateCashViews(userId);
    return result;
  }
};
