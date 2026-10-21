import { rowReading, type RawRow, type RawStatement } from "./cash-statement-rows.js";
import { DATE_SOURCE, StatementFormatError, cashAmountCents, isoDate, legacyAmountReadings, legacyPeriod } from "./cash-statement-text.js";

/**
 * Ancien format (jusqu'à janvier 2026) : « RELEVE COMPTE ESPECES : JUILLET 2021 », feuillets,
 * puis un tableau « date libellé [quantité nom] montant » borné par ANCIEN SOLDE et NOUVEAU SOLDE.
 */

const balanceLine = (label: string) => new RegExp(String.raw`^(${DATE_SOURCE}) ${label} (\d{1,3}(?: \d{3})*,\d{2})$`);
const openingLine = balanceLine("ANCIEN SOLDE");
const closingLine = balanceLine("NOUVEAU SOLDE");
const operationLine = new RegExp(String.raw`^(${DATE_SOURCE}) (.+)$`);

export function isLegacyStatement(lines: readonly string[]) {
  return lines.some((line) => legacyPeriod(line) !== undefined);
}

function readPeriod(lines: readonly string[]) {
  const periods = new Set(lines.map(legacyPeriod).filter((period): period is string => period !== undefined));
  const [period] = [...periods];
  if (periods.size !== 1 || period === undefined) throw new StatementFormatError("Relevé espèces non reconnu : mois du relevé introuvable ou incohérent.");
  return period;
}

/** Tous les feuillets annoncés (« Feuillet 2/3 ») doivent être présents. */
function assertComplete(lines: readonly string[]) {
  const sheets = lines.map((line) => /^Feuillet (\d+)\/(\d+)$/.exec(line)).filter((match) => match !== null);
  const counts = new Set(sheets.map((match) => Number(match[2])));
  const seen = new Set(sheets.map((match) => Number(match[1])));
  const [count] = [...counts];
  if (counts.size !== 1 || count === undefined || seen.size !== count || ![...seen].every((sheet) => sheet >= 1 && sheet <= count)) {
    throw new StatementFormatError("Relevé incomplet : un ou plusieurs feuillets manquent.");
  }
}

function uniqueIndex(lines: readonly string[], pattern: RegExp, label: string) {
  const indexes = lines.flatMap((line, index) => pattern.test(line) ? [index] : []);
  const [index] = indexes;
  if (indexes.length !== 1 || index === undefined) throw new StatementFormatError(`Relevé illisible : ligne « ${label} » introuvable ou en double.`);
  return index;
}

function balance(line: string, pattern: RegExp) {
  const match = pattern.exec(line);
  if (!match?.[1] || !match[2]) throw new StatementFormatError("Relevé illisible : solde illisible.");
  return { date: isoDate(match[1]), cents: cashAmountCents(match[2]) };
}

function readRow(line: string, lineNo: number): RawRow {
  const match = operationLine.exec(line);
  if (!match?.[1] || !match[2]) throw new StatementFormatError(`Ligne ${String(lineNo)} du relevé illisible.`);
  const operationDate = isoDate(match[1]);
  const readings = legacyAmountReadings(match[2]).flatMap((reading) => rowReading(reading.cents, reading.body, operationDate) ?? []);
  if (!readings.length) throw new StatementFormatError(`Ligne ${String(lineNo)} du relevé : libellé inconnu ou montant illisible.`);
  return { operationDate, readings };
}

export function readLegacyStatement(lines: readonly string[]): RawStatement {
  const period = readPeriod(lines);
  assertComplete(lines);
  const openingIndex = uniqueIndex(lines, openingLine, "ANCIEN SOLDE");
  const closingIndex = uniqueIndex(lines, closingLine, "NOUVEAU SOLDE");
  if (closingIndex < openingIndex) throw new StatementFormatError("Relevé illisible : soldes dans le désordre.");
  const opening = balance(lines[openingIndex] ?? "", openingLine);
  const closing = balance(lines[closingIndex] ?? "", closingLine);
  // Entre les deux soldes, toute ligne datée est une opération ; les autres sont des en-têtes de feuillet.
  const rows = lines.slice(openingIndex + 1, closingIndex).filter((line) => operationLine.test(line)).map((line, index) => readRow(line, index + 1));
  return { format: "legacy", period, openingDate: opening.date, closingDate: closing.date, openingCents: opening.cents, closingCents: closing.cents, rows };
}
