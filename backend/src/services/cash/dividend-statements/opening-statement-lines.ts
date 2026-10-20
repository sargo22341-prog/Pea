import type { CashLedgerEntry } from "@pea/shared";
import { dividendVerificationRepository, type StatementLineRow, type StatementPositionRow } from "../../../repositories/cash/dividend-verification.repository.js";
import { centsToMoney, entryTimeMs, isAbsorbed } from "../cash-ledger.js";
import { statementReference } from "../dividends/dividend-verification.js";
import { lineEffectiveAt, positionForIsin } from "./statement-reconciliation.js";

/** Préfixe de l'identifiant d'une ligne de relevé dans le journal : jamais confondu avec `movement:`. */
export const STATEMENT_LINE_ENTRY_PREFIX = "statement-line:";

type StatementLineEntry = Omit<CashLedgerEntry, "balanceAfter">;

function statementLineEntry(row: StatementLineRow, positions: readonly StatementPositionRow[]): StatementLineEntry {
  const position = positionForIsin(positions, row.isin.toUpperCase());
  return {
    id: `${STATEMENT_LINE_ENTRY_PREFIX}${row.id}`,
    kind: "dividend",
    effectiveAt: lineEffectiveAt(row.payment_date),
    amount: centsToMoney(row.net_cents),
    absorbed: true,
    source: "statement",
    symbol: position?.symbol,
    name: position?.name ?? row.name ?? undefined,
    positionId: position?.id,
    isin: row.isin,
    verification: { status: "document", verifiedAt: row.certified_at, reference: statementReference(row.period, row.line_no) }
  };
}

/**
 * Dividendes perçus avant l'état initial, certifiés par relevé : lignes de l'utilisateur dont la
 * date est antérieure ou égale à la date de départ actuelle (elle a pu changer depuis l'import).
 * Rattachées à une position par ISIN uniquement, jamais par nom.
 */
export function openingStatementEntries(userId: number, referenceAt: string | null): StatementLineEntry[] {
  if (referenceAt === null) return [];
  const rows = dividendVerificationRepository.listStatementLines(userId).filter((row) => isAbsorbed(lineEffectiveAt(row.payment_date), referenceAt));
  if (!rows.length) return [];
  const positions = dividendVerificationRepository.listPositions(userId);
  return rows.map((row) => statementLineEntry(row, positions));
}

/**
 * Insère les lignes de relevé dans le journal chronologique, sans effet sur le solde : chacune
 * reprend le solde de l'entrée qui la précède. Ces dividendes sont déjà dans le solde déclaré et
 * dans les dividendes déjà perçus ; aucun indicateur n'est recalculé à partir d'elles.
 */
export function mergeStatementEntries(chronological: readonly CashLedgerEntry[], lines: readonly StatementLineEntry[]): CashLedgerEntry[] {
  if (!lines.length) return [...chronological];
  const merged: CashLedgerEntry[] = [];
  let next = 0;
  const pushLinesUntil = (timeMs: number) => {
    for (let line = lines[next]; line !== undefined && entryTimeMs(line.effectiveAt) <= timeMs; line = lines[++next]) {
      merged.push({ ...line, balanceAfter: merged.at(-1)?.balanceAfter ?? 0 });
    }
  };
  for (const entry of chronological) {
    pushLinesUntil(entryTimeMs(entry.effectiveAt));
    merged.push(entry);
  }
  pushLinesUntil(Number.POSITIVE_INFINITY);
  return merged;
}
