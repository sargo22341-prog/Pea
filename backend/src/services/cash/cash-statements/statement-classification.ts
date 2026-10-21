import type { CashStatementLineCase } from "@pea/shared";
import { isAbsorbed } from "../cash-ledger.js";
import { assignTargets, lineCandidates, type MatchElement } from "./matching/line-matching.js";
import type { ParsedCashStatementLine } from "./parser/cash-statement-parser.js";
import { createdEffectiveAt, matchElements, type CashStatementContext } from "./statement-context.js";
import { lineKey, linkedElementId } from "./statement-keys.js";

/**
 * Rapprochement des lignes d'un lot de relevés espèces avec l'application (règles pures, sans
 * écriture). Un élément déjà rapproché d'une autre ligne n'est jamais candidat : l'unicité ligne ↔
 * élément est garantie avant même l'écriture, puis par les index uniques de la base.
 */

export interface BatchLine {
  period: string;
  line: ParsedCashStatementLine;
}

export interface LineClassification {
  case: CashStatementLineCase;
  target?: MatchElement | undefined;
  candidates: MatchElement[];
  /** Antérieure ou égale à l'état initial : résumée par celui-ci, sans effet sur le solde. */
  beforeStart: boolean;
}

/** Que faire d'une ligne sans élément correspondant. */
function unmatchedCase(line: ParsedCashStatementLine, beforeStart: boolean): CashStatementLineCase {
  switch (line.kind) {
    case "buy":
    case "sell":
      return "missing_trade";
    case "dividend":
      return beforeStart ? "missing_dividend" : "create";
    case "deposit":
    case "withdrawal":
    case "fee":
      return beforeStart ? "opening" : "create";
    case "balance_transfer":
      return "neutral";
    default:
      // Remboursements et indemnisations sont enregistrés même avant l'état initial (déduits des dividendes déjà perçus).
      return "create";
  }
}

export function classifyBatch(context: CashStatementContext, batch: readonly BatchLine[]) {
  const elements = matchElements(context);
  const byId = new Map(elements.map((element) => [element.id, element]));
  const chronology = new Map(elements.map((element, index) => [element.id, index]));
  const stored = new Map(context.lines.map((row) => [lineKey(row.period, row.line_no), row]));
  const linked = new Set(context.lines.map(linkedElementId).filter((id): id is string => id !== undefined));
  const available = elements.filter((element) => !linked.has(element.id));
  const referenceAt = context.account.reference_at ?? undefined;

  const open = batch.flatMap(({ period, line }) => {
    const key = lineKey(period, line.lineNo);
    const row = stored.get(key);
    if ((row && linkedElementId(row)) || line.kind === "balance_transfer") return [];
    const candidates = lineCandidates({ key, kind: line.kind, amountCents: line.amountCents, operationDate: line.operationDate, quantity: line.quantity }, available);
    return [{ key, candidates: candidates.map((candidate) => candidate.id) }];
  });
  const assignments = assignTargets(open, chronology);

  return new Map(batch.map(({ period, line }): [string, LineClassification] => {
    const key = lineKey(period, line.lineNo);
    const beforeStart = isAbsorbed(createdEffectiveAt(line), referenceAt);
    const row = stored.get(key);
    const linkedId = row ? linkedElementId(row) : undefined;
    if (linkedId) return [key, { case: "already_verified", target: byId.get(linkedId), candidates: [], beforeStart }];
    const assignment = assignments.get(key);
    const candidates = (assignment?.candidates ?? []).flatMap((id) => byId.get(id) ?? []);
    if (assignment?.target) return [key, { case: "verify", target: byId.get(assignment.target), candidates: [], beforeStart }];
    if (candidates.length > 1) return [key, { case: "ambiguous", candidates, beforeStart }];
    return [key, { case: unmatchedCase(line, beforeStart), candidates: [], beforeStart }];
  }));
}
