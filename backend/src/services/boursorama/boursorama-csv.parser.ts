import { evaluatePeaEligibility } from "../assets/peaEligibility.js";
import { logger } from "../shared/logger.service.js";

export interface BoursoramaRow {
  line: number;
  name: string;
  isin: string;
  quantity: number;
  buyingPrice: number;
  lastPrice: number;
  intradayVariation: number;
  amount: number;
  amountVariation: number;
  variation: number;
  symbol: string | null;
  peaEligibility?: ReturnType<typeof evaluatePeaEligibility> | undefined;
  detectedAsset?: {
    symbol: string;
    name: string;
    confidenceScore: number;
  } | undefined;
  needsReview: boolean;
  errors: string[];
  existingPositionId?: number | undefined;
}

const headers = ["name", "isin", "quantity", "buyingPrice", "lastPrice", "intradayVariation", "amount", "amountVariation", "variation"];
/** Nombre maximal de lignes d'un import (CSV ou avis d'opéré), validé à la frontière HTTP. */
export const maxImportRows = 1000;
type CsvRowCells = Record<(typeof headers)[number], string>;

export function normalizeFrenchNumber(value: string): number {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ";" && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseBoursoramaCsv(content: string): Omit<BoursoramaRow, "symbol" | "needsReview">[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const start = lines[0]?.toLowerCase().includes("isin") ? 1 : 0;
  const parsed = lines.slice(start).map((line, index) => {
    const cells = splitCsvLine(line);
    const errors: string[] = [];
    if (cells.length < headers.length) errors.push("Ligne incomplete.");
    const row = {} as CsvRowCells;
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex] ?? "";
    });
    if (!row["name"]) errors.push("Nom manquant.");
    if (!row["isin"]) errors.push("ISIN manquant.");
    return {
      line: index + start + 1,
      name: String(row["name"]),
      isin: String(row["isin"]),
      quantity: normalizeFrenchNumber(String(row["quantity"])),
      buyingPrice: normalizeFrenchNumber(String(row["buyingPrice"])),
      lastPrice: normalizeFrenchNumber(String(row["lastPrice"])),
      intradayVariation: normalizeFrenchNumber(String(row["intradayVariation"])),
      amount: normalizeFrenchNumber(String(row["amount"])),
      amountVariation: normalizeFrenchNumber(String(row["amountVariation"])),
      variation: normalizeFrenchNumber(String(row["variation"])),
      errors
    };
  });
  logger.debug("import", "rows parsed", { rows: parsed.length, rowsFailed: parsed.filter((row) => row.errors.length).length });
  return parsed;
}
