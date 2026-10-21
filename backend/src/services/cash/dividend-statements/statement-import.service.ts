import type { DividendStatementLineDecision, DividendStatementPreview, DividendStatementsConfirmInput, DividendStatementsImportResult, DividendStatementsPreviewDto, OpeningDividendsCertification } from "@pea/shared";
import { db } from "../../../db.js";
import { cashRepository } from "../../../repositories/cash/cash.repository.js";
import { dividendVerificationRepository } from "../../../repositories/cash/dividend-verification.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { cashAccountService } from "../cash-account.service.js";
import { centsToMoney, entryTimeMs } from "../cash-ledger.js";
import { invalidateCashViews } from "../cash-movements.service.js";
import type { ParsedDividendStatement } from "./parser/statement-parser.js";
import { applyStatementLine } from "./statement-apply.js";
import { applyRefund, classifyRefund, refundReference } from "./statement-refunds.js";
import { lineKey, loadStatementContext, statementPreview } from "./statement-context.js";
import type { ReadStatement } from "./statement-file.js";
import { classifyLine, lineEffectiveAt, type StatementContext } from "./statement-reconciliation.js";

export const duplicateStatementMessage = "Relevé en double dans le lot : il n'est lu qu'une fois.";

interface ValidStatement {
  fileName: string;
  statement: ParsedDividendStatement;
}

/** Relevés lisibles, un seul par mois ; les autres portent leur erreur. */
function splitStatements(reads: readonly ReadStatement[]) {
  const valid: ValidStatement[] = [];
  const rejected: DividendStatementPreview[] = [];
  const periods = new Set<string>();
  for (const read of reads) {
    const reject = (error: string, period?: string) => { rejected.push({ fileName: read.fileName, period, error, lines: [], refunds: [], totalNet: 0 }); };
    if (read.error !== undefined) reject(read.error);
    else if (periods.has(read.statement.period)) reject(duplicateStatementMessage, read.statement.period);
    else {
      periods.add(read.statement.period);
      valid.push({ fileName: read.fileName, statement: read.statement });
    }
  }
  return { valid, rejected };
}

/** Lignes du lot antérieures ou égales à l'état initial, pas encore certifiées. */
function newOpeningLines(context: StatementContext, statements: readonly ValidStatement[]) {
  return statements.flatMap(({ statement }) => statement.lines
    .filter((line) => classifyLine(context, statement.period, line).case === "opening")
    .map((line) => ({ period: statement.period, line })));
}

function openingCertification(context: StatementContext, statements: readonly ValidStatement[]): OpeningDividendsCertification | undefined {
  const referenceAt = context.account.reference_at;
  if (referenceAt === null) return undefined;
  const pending = newOpeningLines(context, statements);
  const stored = context.statementLines.filter((row) => entryTimeMs(lineEffectiveAt(row.payment_date)) <= entryTimeMs(referenceAt));
  if (!pending.length && !stored.length) return undefined;
  const cents = stored.reduce((sum, row) => sum + row.net_cents, 0) + pending.reduce((sum, { line }) => sum + line.netCents, 0);
  return {
    referenceAt,
    certifiable: centsToMoney(cents),
    declared: context.account.opening_dividends_cents === null ? undefined : centsToMoney(context.account.opening_dividends_cents),
    certifiedAt: context.account.opening_dividends_certified_at ?? undefined
  };
}

/**
 * Conserve les lignes antérieures à l'état initial (mois, ligne, ISIN, montants) dès l'import,
 * certification ou non : le relevé de coupons fait foi pour chacune, et le relevé espèces les
 * rapproche ensuite. Rien n'est crédité : ces dividendes sont dans le solde déclaré.
 */
function keepOpeningLines(userId: number, context: StatementContext, statements: readonly ValidStatement[]) {
  db.transaction(() => {
    const certifiedAt = context.now.toISOString();
    for (const { period, line } of newOpeningLines(context, statements)) {
      dividendVerificationRepository.insertStatementLine(userId, { period, lineNo: line.lineNo, isin: line.isin, name: line.name, paymentDate: line.paymentDate, netCents: line.netCents, withholdingCents: line.withholdingCents, certifiedAt });
    }
  });
}

/**
 * Certifie les dividendes déjà perçus : le total des lignes conservées devient le montant
 * confirmé, tracé comme une correction de l'état initial. Sans effet si déjà certifié à l'identique.
 */
function certifyOpening(userId: number, now: Date) {
  const certification = openingCertification(loadStatementContext(userId, now), []);
  if (!certification || (certification.certifiedAt !== undefined && certification.declared === certification.certifiable)) return false;
  db.transaction(() => {
    const previous = cashAccountService.ensureAccount(userId);
    cashRepository.setOpeningDividends(userId, Math.round(certification.certifiable * 100));
    dividendVerificationRepository.setOpeningDividendsCertified(userId, now.toISOString());
    cashRepository.insertRevision(userId, cashAccountService.settings(previous), cashAccountService.settings(cashAccountService.ensureAccount(userId)));
  });
  return true;
}

/** Réimport : complète le nom des lignes déjà certifiées avant l'état initial (aucun doublon). */
function completeStoredLineNames(userId: number, context: StatementContext, statements: readonly ValidStatement[]) {
  db.transaction(() => {
    for (const { statement } of statements) {
      for (const line of statement.lines) {
        if (context.statementLines.some((row) => row.period === statement.period && row.line_no === line.lineNo && !row.name?.trim())) {
          dividendVerificationRepository.completeStatementLineName(userId, statement.period, line.lineNo, line.name);
        }
      }
    }
  });
}

/** Remboursements du relevé : créés ou certifiés comme mouvements `capital_repayment`, jamais en double. */
function applyRefunds(userId: number, statement: ParsedDividendStatement, decisions: ReadonlyMap<string, DividendStatementLineDecision>, result: DividendStatementsImportResult, now: Date) {
  for (const refund of statement.refunds) {
    const decision = decisions.get(refundReference(statement.period, refund.lineNo));
    if (!decision?.apply) {
      if (classifyRefund(loadStatementContext(userId, now), statement.period, refund).case === "already_certified") result.alreadyCertified += 1;
      else result.skipped += 1;
      continue;
    }
    const outcome = applyRefund(userId, loadStatementContext(userId, now), statement.period, refund, decision.movementId);
    result[outcome] += 1;
    if (outcome === "created" || outcome === "certified") result.refunds += 1;
  }
}

/**
 * Import des relevés mensuels de coupons : un aperçu sans écriture, puis une confirmation qui
 * relit les mêmes fichiers (rien n'est cru du client) et n'applique que les lignes choisies.
 */
export const dividendStatementsService = {
  preview(userId: number, reads: readonly ReadStatement[], now = new Date()): DividendStatementsPreviewDto {
    const context = loadStatementContext(userId, now);
    const { valid, rejected } = splitStatements(reads);
    return {
      statements: [...valid.map(({ fileName, statement }) => statementPreview(context, fileName, statement)), ...rejected],
      opening: openingCertification(context, valid),
      positions: context.positions.map((position) => ({ id: position.id, symbol: position.symbol, name: position.name, isin: position.isin ?? undefined }))
    };
  },

  confirm(userId: number, reads: readonly ReadStatement[], input: DividendStatementsConfirmInput, now = new Date()): DividendStatementsImportResult {
    const initial = loadStatementContext(userId, now);
    const { valid, rejected } = splitStatements(reads);
    completeStoredLineNames(userId, initial, valid);
    const decisions = new Map(input.lines.map((decision) => [decision.key, decision]));
    const result: DividendStatementsImportResult = { certified: 0, corrected: 0, created: 0, alreadyCertified: 0, skipped: 0, refunds: 0, openingCertified: false, errors: rejected.map((row) => ({ fileName: row.fileName, message: row.error ?? "" })) };

    for (const { fileName, statement } of valid) {
      for (const line of statement.lines) {
        const decision = decisions.get(lineKey(statement.period, line.lineNo));
        // Les lignes antérieures à l'état initial ne sont jamais créditées : elles sont conservées à part (keepOpeningLines).
        const current = classifyLine(loadStatementContext(userId, now), statement.period, line).case;
        if (current === "opening") continue;
        if (!decision?.apply) {
          if (current === "already_certified") result.alreadyCertified += 1;
          else result.skipped += 1;
          continue;
        }
        try {
          const outcome = applyStatementLine(userId, loadStatementContext(userId, now), statement.period, line, decision.positionId);
          if (outcome === "opening") continue;
          result[outcome] += 1;
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          result.errors.push({ fileName, lineNo: line.lineNo, message: error.message });
        }
      }
      applyRefunds(userId, statement, decisions, result, now);
    }
    keepOpeningLines(userId, loadStatementContext(userId, now), valid);
    if (input.certifyOpening) result.openingCertified = certifyOpening(userId, now);
    invalidateCashViews(userId);
    return result;
  }
};
