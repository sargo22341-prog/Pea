import { PDFParse } from "pdf-parse";
import type { ParsedAvisOperation, PortfolioTransaction, SearchResult } from "@pea/shared";
import { z } from "zod";
import { portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { currentUserId } from "../auth/user-context.js";
import { evaluatePeaEligibility, sortAssetsForPea } from "../assets/peaEligibility.js";
import { portfolioService } from "../portfolio/portfolio.service.js";
import { marketDataGateway } from "../market/data/market-data-gateway.service.js";
import { parseAvisOperesText } from "./avisOperesParser.service.js";

function normalizeNumericInput(value: unknown) {
  if (typeof value === "string") return value.trim().replace(",", ".");
  return value;
}

function numberSchema(label: string) {
  return z.number({ error: `${label} doit etre un nombre.` }).finite(`${label} doit etre un nombre.`);
}

function requiredNumber(schema: z.ZodNumber) {
  return z.preprocess(
    (value) => {
      const normalized = normalizeNumericInput(value);
      if (normalized === "" || normalized === null || normalized === undefined) return Number.NaN;
      return Number(normalized);
    },
    schema
  );
}

function optionalNumber(schema: z.ZodOptional<z.ZodNumber>) {
  return z.preprocess(
    (value) => {
      const normalized = normalizeNumericInput(value);
      if (normalized === "" || normalized === null || normalized === undefined) return undefined;
      return Number(normalized);
    },
    schema
  );
}

const confirmOperationSchema = z.object({
  sourceFileName: z.string().optional(),
  dateExecution: z.string().optional(),
  nomValeur: z.string().optional(),
  isin: z.string().optional(),
  ticker: z.string().optional(),
  quantite: requiredNumber(numberSchema("Quantite").positive("Quantite doit etre superieure a 0.")),
  sensOperation: z.enum(["achat", "vente", "inconnu"]),
  coursExecute: requiredNumber(numberSchema("Cours").nonnegative("Cours doit etre positif ou nul.")),
  montantTotalFrais: optionalNumber(numberSchema("Total frais").nonnegative("Total frais doit etre positif ou nul.").optional()),
  devise: z.string().default("EUR"),
  rawTextSnippet: z.string().optional(),
  selectedSymbol: z.string().optional(),
  selectedAssetName: z.string().optional(),
  action: z.enum(["import", "ignore"]).optional()
});

function formatValidationError(error: z.ZodError) {
  return error.issues.map((issue) => issue.message).join(" ");
}

async function assertYahooSymbolExists(symbol: string) {
  const key = symbol.trim().toUpperCase();
  const result = await marketDataGateway.readQuoteWithCache(key);
  const foundSymbol = result.data.symbol?.toUpperCase();
  if (!foundSymbol || foundSymbol !== key) {
    throw new Error(`Ticker Yahoo introuvable: ${key}.`);
  }
}

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

  const position = portfolioRepository.findPositionBySymbol(symbol.toUpperCase(), currentUserId());

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
      const result = await marketDataGateway.search(query);
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

  const rows = portfolioRepository.listPositions(currentUserId());

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
    try {
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

      const symbol = row.selectedSymbol.toUpperCase();
      await assertYahooSymbolExists(symbol);
      const name = row.selectedAssetName || row.nomValeur || symbol;
      const type = row.sensOperation === "vente" ? "sell" : "buy";
      const tradedAt = row.dateExecution ?? new Date().toISOString();
      portfolioService.importAvisTransaction({
        symbol,
        name,
        currency: row.devise,
        type,
        quantity: row.quantite,
        price: row.coursExecute,
        tradedAt,
        sourceFileName: row.sourceFileName ?? null,
        assetName: row.nomValeur ?? name,
        isin: row.isin ?? null,
        ticker: symbol,
        totalFees: row.montantTotalFrais ?? null,
        rawTextSnippet: row.rawTextSnippet ?? null
      });
      imported.push(symbol);
    } catch (error) {
      errors.push({
        line: index + 1,
        message: error instanceof z.ZodError ? formatValidationError(error) : error instanceof Error ? error.message : "Import impossible."
      });
    }
  }

  return { imported, skipped, errors };
}
