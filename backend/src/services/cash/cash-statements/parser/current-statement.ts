import { rowReading, type RawRow, type RawStatement } from "./cash-statement-rows.js";
import { CURRENT_AMOUNT_SOURCE, DATE_SOURCE, StatementFormatError, cashAmountCents, isoDate, periodOf, withoutAccents } from "./cash-statement-text.js";

/**
 * Nouveau format (à partir de février 2026) : en-tête « Du JJ/MM/AAAA au JJ/MM/AAAA 1/1 »,
 * « Solde au JJ/MM/AAAA », puis des lignes « date libellé date-de-valeur montant » suivies de
 * « Nom de la valeur: … » et « Quantité: … ». Les autres lignes (nom du donneur d'ordre d'un
 * virement, pieds de page) sont ignorées et jamais conservées.
 */

const periodLine = new RegExp(String.raw`Du (${DATE_SOURCE}) au (${DATE_SOURCE}) (\d+)\/(\d+)$`);
const openingLine = new RegExp(String.raw`^Solde au (${DATE_SOURCE}) (${CURRENT_AMOUNT_SOURCE})$`);
/** « Nouveau solde en EUR : 1 28,70 » : un caractère parasite peut précéder le montant. */
const closingLine = new RegExp(String.raw`^Nouveau solde en EUR :.*?(${CURRENT_AMOUNT_SOURCE})$`);
const operationWithValueDate = new RegExp(String.raw`^(${DATE_SOURCE}) (.+) (${DATE_SOURCE}) (${CURRENT_AMOUNT_SOURCE})$`);
const operationWithoutValueDate = new RegExp(String.raw`^(${DATE_SOURCE}) (.+) (${CURRENT_AMOUNT_SOURCE})$`);
const datedLine = new RegExp(String.raw`^${DATE_SOURCE} `);

export function isCurrentStatement(lines: readonly string[]) {
  return lines.some((line) => closingLine.test(line));
}

/** Période et pages de l'en-tête, répété sur chaque page : une seule période, toutes les pages. */
function readPeriod(lines: readonly string[]) {
  const headers = lines.map((line) => periodLine.exec(line)).filter((match) => match !== null);
  const closings = new Set(headers.map((match) => match[2]));
  const counts = new Set(headers.map((match) => Number(match[4])));
  const pages = new Set(headers.map((match) => Number(match[3])));
  const [closing] = [...closings];
  const [count] = [...counts];
  if (closings.size !== 1 || closing === undefined) throw new StatementFormatError("Relevé espèces non reconnu : période du relevé introuvable ou incohérente.");
  if (counts.size !== 1 || count === undefined || pages.size !== count || ![...pages].every((page) => page >= 1 && page <= count)) {
    throw new StatementFormatError("Relevé incomplet : une ou plusieurs pages manquent.");
  }
  const closingDate = isoDate(closing);
  return { period: periodOf(closingDate), closingDate };
}

function firstMatch(lines: readonly string[], pattern: RegExp, label: string) {
  const index = lines.findIndex((line) => pattern.test(line));
  const match = index < 0 ? null : pattern.exec(lines[index] ?? "");
  if (!match) throw new StatementFormatError(`Relevé illisible : ligne « ${label} » introuvable.`);
  return { index, match };
}

/** « Nom de la valeur: X » et « Quantité: N » qui suivent une opération. */
function readDetail(lines: readonly string[]) {
  let name: string | undefined;
  let quantity: number | undefined;
  for (const line of lines) {
    const nameMatch = /^Nom de la valeur ?: ?(.+)$/i.exec(line);
    const quantityMatch = /^Quantite ?: ?(-?\d+(?:,\d+)?)$/i.exec(withoutAccents(line));
    if (nameMatch?.[1]) name = nameMatch[1].trim();
    if (quantityMatch?.[1]) quantity = Math.abs(Number(quantityMatch[1].replace(",", ".")));
  }
  return { name, quantity };
}

function readRow(lines: readonly string[], index: number, detailEnd: number, lineNo: number): RawRow {
  const line = lines[index] ?? "";
  const match = operationWithValueDate.exec(line);
  const fallback = match ? null : operationWithoutValueDate.exec(line);
  const operationDateText = match?.[1] ?? fallback?.[1];
  const labelText = match?.[2] ?? fallback?.[2];
  const amountText = match?.[4] ?? fallback?.[3];
  if (!operationDateText || !labelText || !amountText) throw new StatementFormatError(`Ligne ${String(lineNo)} du relevé illisible.`);
  const operationDate = isoDate(operationDateText);
  const reading = rowReading(cashAmountCents(amountText), labelText, operationDate, readDetail(lines.slice(index + 1, detailEnd)));
  if (!reading) throw new StatementFormatError(`Ligne ${String(lineNo)} du relevé : libellé inconnu.`);
  return { operationDate, valueDate: match?.[3] ? isoDate(match[3]) : undefined, readings: [reading] };
}

export function readCurrentStatement(lines: readonly string[]): RawStatement {
  const { period, closingDate } = readPeriod(lines);
  const opening = firstMatch(lines, openingLine, "Solde au");
  const closing = firstMatch(lines, closingLine, "Nouveau solde");
  // Après « Solde au », toute ligne datée est une opération, sauf l'en-tête de page répété.
  const operationIndexes = lines.flatMap((line, index) => index > opening.index && datedLine.test(line) && !periodLine.test(line) ? [index] : []);
  const rows = operationIndexes.map((index, position) => readRow(lines, index, operationIndexes[position + 1] ?? lines.length, position + 1));
  return {
    format: "current",
    period,
    openingDate: isoDate(opening.match[1] ?? ""),
    closingDate,
    openingCents: cashAmountCents(opening.match[2] ?? ""),
    closingCents: cashAmountCents(closing.match[1] ?? ""),
    rows
  };
}
