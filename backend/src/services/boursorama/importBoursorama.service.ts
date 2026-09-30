import type { BoursoramaUpdateRow, SearchResult } from "@pea/shared";
import { db } from "../../db.js";
import { HttpError } from "../../utils/http-error.js";
import { evaluatePeaEligibility, sortAssetsForPea } from "../assets/peaEligibility.js";
import { marketDataGateway } from "../market/data/market-data-gateway.service.js";
import { holdingTolerance } from "../portfolio/holdings/holding-adjustment.js";
import { portfolioService } from "../portfolio/portfolio.service.js";
import { assertYahooSymbolExists } from "./avis-import-validation.js";
import { maxImportRows, parseBoursoramaCsv, type BoursoramaRow } from "./boursorama-csv.parser.js";

export { normalizeFrenchNumber, parseBoursoramaCsv, type BoursoramaRow } from "./boursorama-csv.parser.js";

// Toutes les opérations d'import s'exécutent sous `runWithUser` (route protégée par requireAuth) :
// les services portfolio résolvent l'utilisateur courant eux-mêmes.

/**
 * L'export Boursorama n'a pas de colonne devise : ses montants (PRU) sont exprimés dans la devise
 * du compte PEA, toujours l'euro.
 */
const boursoramaAccountCurrency = "EUR";

interface ImportResult {
  imported: string[];
  skipped: string[];
  errors: { line: number; message: string }[];
}

interface PlannedHolding {
  symbol: string;
  name: string;
  quantity: number;
  averageBuyPrice: number;
  mode: "replace" | "add";
}

export async function resolveYahooSymbolFromIsin(isin: string, name: string) {
  const byIsin = await findBestCandidate(isin);
  if (byIsin.symbol) return byIsin;
  return findBestCandidate(name);
}

async function findBestCandidate(query: string): Promise<{ symbol: string | null; asset?: SearchResult; needsReview: boolean }> {
  const result = await marketDataGateway.search(query);
  const candidates = sortAssetsForPea(result.data.map((item) => ({ ...item, peaEligibility: item.peaEligibility ?? evaluatePeaEligibility(item) })));
  const best = candidates[0];
  if (!best) return { symbol: null, needsReview: true };
  return {
    symbol: best.symbol,
    asset: best,
    needsReview: candidates.length > 1 || !["eligible", "likely_eligible"].includes(best.peaEligibility.status)
  };
}

function parseWithinLimit(content: string) {
  const parsed = parseBoursoramaCsv(content);
  if (parsed.length > maxImportRows) throw new HttpError(400, `Import limite a ${maxImportRows} lignes.`);
  return parsed;
}

function holdingsBySymbol() {
  return new Map(portfolioService.listHoldings().map((position) => [position.symbol.toUpperCase(), position]));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Applique en une seule transaction les détentions validées : un échec d'écriture annule tout
 * l'import au lieu de laisser un portefeuille partiellement modifié.
 */
function applyPlannedHoldings(planned: PlannedHolding[], result: ImportResult) {
  const tradedAt = new Date().toISOString();
  db.transaction(() => {
    for (const holding of planned) {
      portfolioService.applyImportedHolding({ ...holding, currency: boursoramaAccountCurrency, tradedAt });
    }
  });
  result.imported.push(...planned.map((holding) => holding.symbol));
}

export async function previewBoursoramaImport(content: string): Promise<BoursoramaRow[]> {
  const parsed = parseWithinLimit(content);
  const holdings = holdingsBySymbol();
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
    rows.push({
      ...row,
      symbol,
      detectedAsset: resolved.asset
        ? { symbol: resolved.asset.symbol.toUpperCase(), name: resolved.asset.name, confidenceScore: resolved.needsReview ? 0.75 : 0.95 }
        : undefined,
      peaEligibility: resolved.asset?.peaEligibility ?? (symbol ? evaluatePeaEligibility({ symbol, name: row.name }) : undefined),
      needsReview: resolved.needsReview || row.errors.length > 0,
      existingPositionId: symbol ? holdings.get(symbol)?.id : undefined
    });
  }
  return rows;
}

export async function confirmBoursoramaImport(rows: (BoursoramaRow & { action?: "replace" | "merge" | "ignore" | undefined })[]): Promise<ImportResult> {
  const result: ImportResult = { imported: [], skipped: [], errors: [] };
  const planned: PlannedHolding[] = [];
  for (const row of rows) {
    if (row.action === "ignore" || !row.symbol) {
      result.skipped.push(row.name);
      continue;
    }
    try {
      if (row.errors.length) throw new Error(row.errors.join(", "));
      const symbol = row.symbol.toUpperCase();
      await assertYahooSymbolExists(symbol);
      planned.push({
        symbol,
        name: row.name,
        quantity: row.quantity,
        averageBuyPrice: row.buyingPrice,
        mode: row.action === "replace" ? "replace" : "add"
      });
    } catch (error) {
      result.errors.push({ line: row.line, message: errorMessage(error, "Import impossible.") });
    }
  }
  applyPlannedHoldings(planned, result);
  return result;
}

function proposedUpdateAction(row: BoursoramaRow, existing: { quantity: number; averageBuyPrice: number } | undefined): BoursoramaUpdateRow["proposedAction"] {
  if (!row.symbol || row.errors.length) return "ignore";
  if (!existing) return "add";
  const quantityDiff = row.quantity - existing.quantity;
  if (Math.abs(quantityDiff) < holdingTolerance && Math.abs(row.buyingPrice - existing.averageBuyPrice) < holdingTolerance) return "unchanged";
  return quantityDiff < 0 ? "reduce" : "update";
}

export async function previewBoursoramaUpdate(content: string): Promise<BoursoramaUpdateRow[]> {
  const previewRows = await previewBoursoramaImport(content);
  const holdings = holdingsBySymbol();
  const csvSymbols = new Set(previewRows.flatMap((row) => (row.symbol ? [row.symbol.toUpperCase()] : [])));
  const rows: BoursoramaUpdateRow[] = previewRows.map((row) => {
    const existing = row.symbol ? holdings.get(row.symbol.toUpperCase()) : undefined;
    return {
      ...row,
      currentQuantity: existing?.quantity,
      csvQuantity: row.quantity,
      quantityDiff: row.quantity - (existing?.quantity ?? 0),
      currentAverageBuyPrice: existing?.averageBuyPrice,
      csvAverageBuyPrice: row.buyingPrice,
      proposedAction: proposedUpdateAction(row, existing),
      positionId: existing?.id
    };
  });
  for (const [symbol, existing] of holdings) {
    if (csvSymbols.has(symbol)) continue;
    rows.push({
      line: 0,
      name: existing.name,
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
      existingPositionId: existing.id,
      currentQuantity: existing.quantity,
      csvQuantity: 0,
      quantityDiff: -existing.quantity,
      currentAverageBuyPrice: existing.averageBuyPrice,
      csvAverageBuyPrice: 0,
      proposedAction: "delete",
      positionId: existing.id
    });
  }
  return rows;
}

export async function confirmBoursoramaUpdate(rows: BoursoramaUpdateRow[]): Promise<ImportResult> {
  const result: ImportResult = { imported: [], skipped: [], errors: [] };
  const planned: PlannedHolding[] = [];
  const deletions: { line: number; symbol: string; positionId: number }[] = [];
  for (const row of rows) {
    if (row.proposedAction === "ignore" || row.proposedAction === "unchanged" || !row.symbol) {
      result.skipped.push(row.name);
      continue;
    }
    try {
      if (row.errors.length) throw new Error(row.errors.join(", "));
      const symbol = row.symbol.toUpperCase();
      if (row.proposedAction === "delete") {
        if (!row.positionId) throw new Error("Position introuvable pour suppression.");
        deletions.push({ line: row.line, symbol, positionId: row.positionId });
        continue;
      }
      await assertYahooSymbolExists(symbol);
      planned.push({ symbol, name: row.name, quantity: row.csvQuantity, averageBuyPrice: row.csvAverageBuyPrice, mode: "replace" });
    } catch (error) {
      result.errors.push({ line: row.line, message: errorMessage(error, "Mise a jour impossible.") });
    }
  }
  db.transaction(() => {
    for (const deletion of deletions) {
      if (portfolioService.deletePosition(deletion.positionId)) result.imported.push(deletion.symbol);
      else result.errors.push({ line: deletion.line, message: "Position introuvable pour suppression." });
    }
    applyPlannedHoldings(planned, result);
  });
  return result;
}
