import { PDFParse } from "pdf-parse";
import type { ParsedAvisOperation, PortfolioTransaction, SearchResult } from "@pea/shared";
import { z } from "zod";
import { db } from "../../db.js";
import { HttpError } from "../../utils/http-error.js";
import { evaluatePeaEligibility, sortAssetsForPea } from "../peaEligibility.js";
import { portfolioService } from "../portfolio.service.js";
import { yahooService } from "../yahoo/index.js";
import { parseAvisOperesText } from "./avisOperesParser.service.js";

export interface PdfUpload {
  fileName: string;
  buffer: Buffer;
}

const confirmOperationSchema = z.object({
  sourceFileName: z.string().optional(),
  dateExecution: z.string().optional(),
  nomValeur: z.string().optional(),
  isin: z.string().optional(),
  ticker: z.string().optional(),
  quantite: z.coerce.number().positive(),
  sensOperation: z.enum(["achat", "vente", "inconnu"]),
  coursExecute: z.coerce.number().nonnegative(),
  montantTotalFrais: z.coerce.number().nonnegative().optional(),
  devise: z.string().default("EUR"),
  rawTextSnippet: z.string().optional(),
  selectedSymbol: z.string().optional(),
  selectedAssetName: z.string().optional(),
  action: z.enum(["import", "ignore"]).optional()
});

/**
 * Représente un fichier PDF envoyé pour l’import d’avis d’opéré.
 */
export interface PdfUpload {
  fileName: string;
  buffer: Buffer;
}

/**
 * Extrait le texte brut d’un fichier PDF.
 */
export async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

/**
 * Prépare l’import d’un ou plusieurs avis d’opéré PDF.
 *
 * Extrait le texte, parse les opérations, tente de résoudre l’actif associé,
 * puis ajoute un avertissement si un doublon potentiel est détecté.
 */
export async function previewAvisOperesImport(
  files: PdfUpload[]
): Promise<ParsedAvisOperation[]> {
  const rows: ParsedAvisOperation[] = [];

  for (const file of files) {
    if (!file.fileName.toLowerCase().endsWith(".pdf")) {
      throw new HttpError(400, "Seuls les fichiers PDF sont acceptes.");
    }

    const text = await extractPdfText(file.buffer);
    const parsed = parseAvisOperesText(text, file.fileName);

    for (const operation of parsed) {
      const resolved = await resolveAssetFromOperation(operation);
      rows.push(markDuplicateWarning(resolved));
    }
  }

  return rows;
}

/**
 * Détecte si une opération importée correspond probablement à une transaction existante.
 *
 * La comparaison se fait sur la date, la quantité et le symbole de l’actif.
 */
export function detectPotentialDuplicateTransaction(
  parsedTransaction: ParsedAvisOperation,
  existingTransactions: PortfolioTransaction[]
): boolean {
  if (!parsedTransaction.dateExecution || !parsedTransaction.quantite) return false;

  const parsedDate = parsedTransaction.dateExecution.slice(0, 10);
  const parsedTicker = (
    parsedTransaction.selectedSymbol ??
    parsedTransaction.ticker ??
    parsedTransaction.resolvedAsset?.symbol ??
    ""
  ).toUpperCase();

  const parsedAssetId = parsedTransaction.resolvedAsset?.symbol?.toUpperCase();

  return existingTransactions.some((transaction) => {
    const sameDate = transaction.dateExecution?.slice(0, 10) === parsedDate;
    const sameQuantity =
      Math.abs(Number(transaction.quantity) - Number(parsedTransaction.quantite)) < 0.000001;

    const ticker = (transaction.ticker ?? transaction.assetId ?? "").toUpperCase();

    const sameAsset =
      Boolean(parsedTicker && ticker === parsedTicker) ||
      Boolean(parsedAssetId && ticker === parsedAssetId);

    return sameDate && sameQuantity && sameAsset;
  });
}

/**
 * Ajoute un warning si l’opération semble déjà exister dans le portefeuille.
 */
function markDuplicateWarning(operation: ParsedAvisOperation): ParsedAvisOperation {
  const symbol = operation.selectedSymbol ?? operation.resolvedAsset?.symbol;
  if (!symbol) return operation;

  const position = db
    .prepare("SELECT id FROM positions WHERE symbol = ?")
    .get(symbol.toUpperCase()) as { id: number } | undefined;

  if (!position) return operation;

  const duplicate = detectPotentialDuplicateTransaction(
    operation,
    portfolioService.listTransactions(position.id)
  );

  if (!duplicate) return operation;

  return {
    ...operation,
    potentialDuplicate: true,
    warnings: [...operation.warnings, "Doublon possible."]
  };
}

/**
 * Tente d’associer automatiquement une opération à un actif connu.
 *
 * La résolution se fait d’abord via les positions existantes,
 * puis via une recherche Yahoo Finance sur l’ISIN, le ticker ou le nom de valeur.
 */
export async function resolveAssetFromOperation(
  operation: ParsedAvisOperation
): Promise<ParsedAvisOperation> {
  const existing = findExistingPosition(operation);

  if (existing) {
    return {
      ...operation,
      resolvedAsset: {
        symbol: existing.symbol,
        name: existing.name,
        confidenceScore: existing.score
      },
      selectedSymbol: existing.symbol,
      selectedAssetName: existing.name
    };
  }

  const queries = [operation.isin, operation.ticker, operation.nomValeur].filter(
    (value): value is string => Boolean(value?.trim())
  );

  for (const query of queries) {
    try {
      const result = await yahooService.search(query);
      const best = bestCandidate(result.data);

      if (best) {
        return {
          ...operation,
          resolvedAsset: {
            symbol: best.symbol,
            name: best.name,
            confidenceScore: best.score
          },
          selectedSymbol: best.symbol,
          selectedAssetName: best.name
        };
      }
    } catch {
      // La prévisualisation reste utilisable avec une résolution manuelle.
    }
  }

  return {
    ...operation,
    warnings: [...operation.warnings, "Aucun actif resolu automatiquement."]
  };
}

/**
 * Recherche une position existante pouvant correspondre à l’opération parsée.
 */
function findExistingPosition(operation: ParsedAvisOperation) {
  const candidates = [operation.ticker, operation.nomValeur, operation.isin]
    .filter(Boolean)
    .map((value) => String(value).toUpperCase());

  const rows = db
    .prepare("SELECT symbol, name FROM positions")
    .all() as Array<{ symbol: string; name: string }>;

  for (const row of rows) {
    const symbol = String(row.symbol).toUpperCase();
    const name = String(row.name).toUpperCase();

    if (
      candidates.some(
        (candidate) =>
          symbol === candidate ||
          name.includes(candidate) ||
          candidate.includes(name)
      )
    ) {
      return {
        symbol: row.symbol,
        name: row.name,
        score: symbol === operation.ticker?.toUpperCase() ? 0.98 : 0.75
      };
    }
  }

  return undefined;
}

/**
 * Sélectionne le meilleur résultat de recherche en privilégiant les actifs compatibles PEA.
 */
function bestCandidate(items: SearchResult[]) {
  const sorted = sortAssetsForPea(
    items.map((item) => ({
      ...item,
      peaEligibility: item.peaEligibility ?? evaluatePeaEligibility(item)
    }))
  );

  const best = sorted[0];
  if (!best) return undefined;

  const eligible = ["eligible", "likely_eligible"].includes(
    best.peaEligibility?.status ?? "unknown"
  );

  return {
    symbol: best.symbol.toUpperCase(),
    name: best.name,
    score: eligible ? 0.82 : 0.55
  };
}

/**
 * Confirme l’import des opérations prévisualisées.
 *
 * Pour chaque ligne, valide les données, ignore les lignes demandées,
 * crée ou retrouve la position, insère la transaction,
 * puis recalcule la position associée.
 */
export async function confirmAvisOperesImport(rows: unknown[]) {
  const imported: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = confirmOperationSchema.parse(rows[index]);

    if (row.action === "ignore") {
      skipped.push(row.nomValeur ?? row.selectedSymbol ?? `ligne ${index + 1}`);
      continue;
    }

    if (!row.selectedSymbol) {
      errors.push({ line: index + 1, message: "Actif non resolu." });
      continue;
    }

    if (row.sensOperation === "inconnu") {
      errors.push({ line: index + 1, message: "Sens achat/vente requis." });
      continue;
    }

    try {
      const symbol = row.selectedSymbol.toUpperCase();
      const name = row.selectedAssetName || row.nomValeur || symbol;
      const position = await portfolioService.ensurePosition(symbol, name, row.devise);
      const type = row.sensOperation === "vente" ? "sell" : "buy";

      db.prepare(
        `INSERT INTO transactions (
          position_id, type, quantity, price, currency, traded_at, source, source_file_name,
          asset_name, isin, ticker, total_fees, raw_text_snippet
        ) VALUES (?, ?, ?, ?, ?, ?, 'pdf_avis_opere', ?, ?, ?, ?, ?, ?)`
      ).run(
        position.id,
        type,
        row.quantite,
        row.coursExecute,
        row.devise,
        row.dateExecution ?? new Date().toISOString(),
        row.sourceFileName ?? null,
        row.nomValeur ?? name,
        row.isin ?? null,
        symbol,
        row.montantTotalFrais ?? null,
        row.rawTextSnippet ?? null
      );

      portfolioService.recomputePositionFromDatedTransactions(position.id);
      imported.push(symbol);
    } catch (error) {
      errors.push({
        line: index + 1,
        message: error instanceof Error ? error.message : "Import impossible."
      });
    }
  }

  return { imported, skipped, errors };
}

/**
 * Service regroupant les fonctions d’import d’avis d’opéré.
 */
export const importAvisOperesService = {
  extractPdfText,
  previewAvisOperesImport,
  resolveAssetFromOperation,
  detectPotentialDuplicateTransaction,
  confirmAvisOperesImport
};
