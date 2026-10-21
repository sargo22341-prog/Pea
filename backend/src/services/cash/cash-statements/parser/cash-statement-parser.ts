import { createHash } from "node:crypto";
import type { CashStatementFormat, CashStatementLineKind } from "@pea/shared";
import { StatementFormatError, statementLines } from "./cash-statement-text.js";
import { isCurrentStatement, readCurrentStatement } from "./current-statement.js";
import { isLegacyStatement, readLegacyStatement } from "./legacy-statement.js";
import { resolveSigns } from "./statement-signs.js";

/** Ligne d'opération lue, montant signé en centimes (positif = crédit). */
export interface ParsedCashStatementLine {
  lineNo: number;
  operationDate: string;
  valueDate?: string | undefined;
  kind: CashStatementLineKind;
  label: string;
  amountCents: number;
  quantity?: number | undefined;
  name?: string | undefined;
  couponDate?: string | undefined;
}

export interface ParsedCashStatement {
  format: CashStatementFormat;
  /** Mois du relevé (`AAAA-MM`), lu dans le contenu, jamais dans le nom du fichier. */
  period: string;
  /** Date de l'ancien solde : le relevé couvre les jours qui suivent, jusqu'à `closingDate`. */
  openingDate: string;
  closingDate: string;
  openingCents: number;
  closingCents: number;
  lines: ParsedCashStatementLine[];
  /** Empreinte du contenu lu (sans donnée personnelle) : deux fichiers identiques ont la même. */
  fingerprint: string;
}

function assertWithinPeriod(statement: { openingDate: string; closingDate: string }, lines: readonly ParsedCashStatementLine[]) {
  if (statement.openingDate > statement.closingDate) throw new StatementFormatError("Relevé incohérent : période inversée.");
  const outside = lines.find((line) => line.operationDate < statement.openingDate || line.operationDate > statement.closingDate);
  if (outside) throw new StatementFormatError(`Ligne ${String(outside.lineNo)} du relevé datée hors de sa période.`);
}

function fingerprint(statement: Omit<ParsedCashStatement, "fingerprint">) {
  return createHash("sha256").update(JSON.stringify(statement)).digest("hex");
}

/**
 * Lit un relevé espèces mensuel (texte extrait par `pdf-parse`), ancien ou nouveau format.
 * Contrôles : mois unique, feuillets ou pages complets, chaque ligne lisible avec un libellé
 * connu, sens résolu par le bouclage du solde, dates dans la période. Le moindre écart refuse le
 * relevé entier.
 */
export function parseCashStatement(text: string): ParsedCashStatement {
  const lines = statementLines(text);
  let raw;
  if (isLegacyStatement(lines)) raw = readLegacyStatement(lines);
  else if (isCurrentStatement(lines)) raw = readCurrentStatement(lines);
  else throw new StatementFormatError("Relevé espèces non reconnu.");
  const resolved = resolveSigns(raw).map((row, index): ParsedCashStatementLine => ({
    lineNo: index + 1,
    operationDate: raw.rows[index]?.operationDate ?? "",
    valueDate: raw.rows[index]?.valueDate,
    kind: row.kind,
    label: row.reading.label.label,
    amountCents: row.amountCents,
    quantity: row.reading.quantity,
    name: row.reading.name,
    couponDate: row.reading.couponDate
  }));
  const header = { format: raw.format, period: raw.period, openingDate: raw.openingDate, closingDate: raw.closingDate, openingCents: raw.openingCents, closingCents: raw.closingCents };
  assertWithinPeriod(header, resolved);
  const statement = { ...header, lines: resolved };
  return { ...statement, fingerprint: fingerprint(statement) };
}
