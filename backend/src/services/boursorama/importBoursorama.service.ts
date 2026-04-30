import type { SearchResult } from "@pea/shared";
import type { BoursoramaUpdateRow } from "@pea/shared";
import { db } from "../../db.js";
import { evaluatePeaEligibility, sortAssetsForPea } from "../peaEligibility.js";
import { logger } from "../logger.service.js";
import { portfolioService } from "../portfolio.service.js";
import { yahooService } from "../yahoo.service.js";

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
  peaEligibility?: ReturnType<typeof evaluatePeaEligibility>;
  needsReview: boolean;
  errors: string[];
  existingPositionId?: number;
}

const headers = ["name", "isin", "quantity", "buyingPrice", "lastPrice", "intradayVariation", "amount", "amountVariation", "variation"];

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
    const char = line[index];
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

export function parseBoursoramaCsv(content: string): Array<Omit<BoursoramaRow, "symbol" | "needsReview">> {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const start = lines[0]?.toLowerCase().includes("isin") ? 1 : 0;
  const parsed = lines.slice(start).map((line, index) => {
    const cells = splitCsvLine(line);
    const errors: string[] = [];
    if (cells.length < headers.length) errors.push("Ligne incomplete.");
    const row: any = {};
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex] ?? "";
    });
    if (!row.name) errors.push("Nom manquant.");
    if (!row.isin) errors.push("ISIN manquant.");
    return {
      line: index + start + 1,
      name: String(row.name),
      isin: String(row.isin),
      quantity: normalizeFrenchNumber(String(row.quantity)),
      buyingPrice: normalizeFrenchNumber(String(row.buyingPrice)),
      lastPrice: normalizeFrenchNumber(String(row.lastPrice)),
      intradayVariation: normalizeFrenchNumber(String(row.intradayVariation)),
      amount: normalizeFrenchNumber(String(row.amount)),
      amountVariation: normalizeFrenchNumber(String(row.amountVariation)),
      variation: normalizeFrenchNumber(String(row.variation)),
      errors
    };
  });
  logger.debug("import", "rows parsed", { rows: parsed.length, rowsFailed: parsed.filter((row) => row.errors.length).length });
  return parsed;
}

export async function resolveYahooSymbolFromIsin(isin: string, name: string) {
  const byIsin = await findBestCandidate(isin);
  if (byIsin) return byIsin;
  return findBestCandidate(name);
}

async function findBestCandidate(query: string): Promise<{ symbol: string | null; asset?: SearchResult; needsReview: boolean }> {
  const result = await yahooService.search(query);
  const candidates = sortAssetsForPea(result.data.map((item) => ({ ...item, peaEligibility: item.peaEligibility ?? evaluatePeaEligibility(item) })));
  const best = candidates[0];
  if (!best) return { symbol: null, needsReview: true };
  return {
    symbol: best.symbol,
    asset: best,
    needsReview: candidates.length > 1 || !["eligible", "likely_eligible"].includes(best.peaEligibility?.status ?? "unknown")
  };
}

export async function previewBoursoramaImport(content: string): Promise<BoursoramaRow[]> {
  const parsed = parseBoursoramaCsv(content);
  const rows: BoursoramaRow[] = [];
  for (const row of parsed) {
    let resolved: Awaited<ReturnType<typeof resolveYahooSymbolFromIsin>> = { symbol: null, needsReview: true };
    if (!row.errors.length) {
      try {
        resolved = await resolveYahooSymbolFromIsin(row.isin, row.name);
      } catch {
        row.errors.push("Resolution Yahoo impossible.");
      }
    }
    const symbol = resolved.symbol?.toUpperCase() ?? null;
    const existing = symbol ? (db.prepare("SELECT id FROM positions WHERE symbol = ?").get(symbol) as { id: number } | undefined) : undefined;
    rows.push({
      ...row,
      symbol,
      peaEligibility: resolved.asset?.peaEligibility ?? (symbol ? evaluatePeaEligibility({ symbol, name: row.name }) : undefined),
      needsReview: resolved.needsReview || row.errors.length > 0,
      existingPositionId: existing?.id
    });
  }
  return rows;
}

export async function confirmBoursoramaImport(rows: Array<BoursoramaRow & { action?: "replace" | "merge" | "ignore" }>) {
  const imported: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (const row of rows) {
    try {
      if (row.action === "ignore" || !row.symbol) {
        skipped.push(row.name);
        continue;
      }
      const existing = db.prepare("SELECT * FROM positions WHERE symbol = ?").get(row.symbol) as any;
      if (existing && row.action === "replace") {
        db.prepare(
          `UPDATE positions
           SET name = ?, quantity = ?, average_buy_price = ?, currency = 'EUR', updated_at = CURRENT_TIMESTAMP
           WHERE symbol = ?`
        ).run(row.name, row.quantity, row.buyingPrice, row.symbol);
      } else {
        await portfolioService.createPosition({
          symbol: row.symbol,
          name: row.name,
          quantity: row.quantity,
          averageBuyPrice: row.buyingPrice,
          currency: "EUR"
        }, { scheduleConstruction: false });
      }
      imported.push(row.symbol);
    } catch (error) {
      errors.push({ line: row.line, message: error instanceof Error ? error.message : "Import impossible." });
    }
  }

  return { imported, skipped, errors };
}

export async function previewBoursoramaUpdate(content: string): Promise<BoursoramaUpdateRow[]> {
  const previewRows = await previewBoursoramaImport(content);
  const csvSymbols = new Set(previewRows.map((row) => row.symbol).filter(Boolean).map((symbol) => String(symbol).toUpperCase()));
  const rows: BoursoramaUpdateRow[] = [];

  for (const row of previewRows) {
    const existing = row.symbol ? db.prepare("SELECT * FROM positions WHERE symbol = ?").get(row.symbol) as any : undefined;
    const currentQuantity = existing ? Number(existing.quantity) : undefined;
    const currentAverageBuyPrice = existing ? Number(existing.average_buy_price) : undefined;
    const quantityDiff = row.quantity - (currentQuantity ?? 0);
    const proposedAction =
      !row.symbol || row.errors.length
        ? "ignore"
        : !existing
          ? "add"
          : Math.abs(quantityDiff) < 0.000001 && Math.abs(row.buyingPrice - (currentAverageBuyPrice ?? row.buyingPrice)) < 0.000001
            ? "unchanged"
            : quantityDiff < 0
              ? "reduce"
              : "update";
    rows.push({
      ...row,
      currentQuantity,
      csvQuantity: row.quantity,
      quantityDiff,
      currentAverageBuyPrice,
      csvAverageBuyPrice: row.buyingPrice,
      proposedAction,
      positionId: existing?.id
    });
  }

  const existingRows = db.prepare("SELECT * FROM positions ORDER BY symbol ASC").all() as any[];
  for (const existing of existingRows) {
    const symbol = String(existing.symbol).toUpperCase();
    if (csvSymbols.has(symbol)) continue;
    rows.push({
      line: 0,
      name: String(existing.name),
      isin: "",
      quantity: 0,
      buyingPrice: 0,
      lastPrice: 0,
      intradayVariation: 0,
      amount: 0,
      amountVariation: 0,
      variation: 0,
      symbol,
      needsReview: true,
      errors: [],
      existingPositionId: Number(existing.id),
      currentQuantity: Number(existing.quantity),
      csvQuantity: 0,
      quantityDiff: -Number(existing.quantity),
      currentAverageBuyPrice: Number(existing.average_buy_price),
      csvAverageBuyPrice: 0,
      proposedAction: "delete",
      positionId: Number(existing.id)
    });
  }

  return rows;
}

export async function confirmBoursoramaUpdate(rows: BoursoramaUpdateRow[]) {
  const imported: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (const row of rows) {
    try {
      if (row.proposedAction === "ignore" || row.proposedAction === "unchanged" || !row.symbol) {
        skipped.push(row.name);
        continue;
      }
      if (row.proposedAction === "delete") {
        if (!row.positionId) throw new Error("Position introuvable pour suppression.");
        portfolioService.deletePosition(row.positionId);
        imported.push(row.symbol);
        continue;
      }
      const existing = db.prepare("SELECT * FROM positions WHERE symbol = ?").get(row.symbol) as any;
      if (existing) {
        db.prepare(
          `UPDATE positions
           SET name = ?, quantity = ?, average_buy_price = ?, currency = 'EUR', updated_at = CURRENT_TIMESTAMP
           WHERE symbol = ?`
        ).run(row.name, row.csvQuantity, row.csvAverageBuyPrice, row.symbol);
      } else {
        await portfolioService.createPosition({
          symbol: row.symbol,
          name: row.name,
          quantity: row.csvQuantity,
          averageBuyPrice: row.csvAverageBuyPrice,
          currency: "EUR"
        }, { scheduleConstruction: false });
      }
      imported.push(row.symbol);
    } catch (error) {
      errors.push({ line: row.line, message: error instanceof Error ? error.message : "Mise a jour impossible." });
    }
  }

  return { imported, skipped, errors };
}

export const importBoursoramaService = {
  parseBoursoramaCsv,
  normalizeFrenchNumber,
  resolveYahooSymbolFromIsin,
  previewBoursoramaImport,
  confirmBoursoramaImport,
  previewBoursoramaUpdate,
  confirmBoursoramaUpdate
};
