import type { CashFundingInput, ParsedAvisOperation, SearchResult } from "@pea/shared";
import { z } from "zod";
import { config } from "../../config.js";
import { cashRepository } from "../../repositories/cash/cash.repository.js";
import { portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { currentUserId } from "../auth/user-context.js";
import { evaluatePeaEligibility, sortAssetsForPea } from "../assets/peaEligibility.js";
import { portfolioService } from "../portfolio/portfolio.service.js";
import { marketDataGateway } from "../market/data/market-data-gateway.service.js";
import { logger } from "../shared/logger.service.js";
import { parseAvisOperesText } from "./avisOperesParser.service.js";
import { extractPdfText } from "./pdf-text-extractor.js";
import { batchFundingDate, withCashGuard } from "../cash/cash-guard.js";
import { alreadyImportedMessage } from "../portfolio/portfolio-write.service.js";

import { isDuplicateOfExistingTransaction, markDuplicatesWithinBatch, withDuplicateWarning } from "./avis-duplicates.js";
import { assertYahooSymbolExists, confirmOperationSchema, formatValidationError } from "./avis-import-validation.js";
export interface PdfUpload {
  fileName: string;
  buffer: Buffer;
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

  return markDuplicatesWithinBatch(rows);
}

/**
 * Ajoute un avertissement si l’opération semble déjà exister sur la position de l’actif. Un avis
 * dont la référence d'ordre est déjà importée est en plus proposé à l'ignorance par défaut.
 */
function markDuplicateWarning(operation: ParsedAvisOperation): ParsedAvisOperation {
  const importRef = avisImportRef(operation.reference);
  if (importRef && cashRepository.tradeImportRefExists(currentUserId(), importRef)) {
    const duplicate = withDuplicateWarning(operation);
    return { ...duplicate, action: "ignore", warnings: [...duplicate.warnings, alreadyImportedMessage] };
  }
  const symbol = operation.selectedSymbol ?? operation.resolvedAsset?.symbol;
  if (!symbol) return operation;
  const position = portfolioRepository.findPositionBySymbol(symbol.toUpperCase(), currentUserId());
  if (!position) return operation;
  const existing = portfolioService.listTransactions(position.id);
  return isDuplicateOfExistingTransaction(operation, existing, config.appTimezone) ? withDuplicateWarning(operation) : operation;
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
    } catch (error) {
      // La prévisualisation reste utilisable avec une résolution manuelle.
      logger.debug("import", "asset resolution failed", { query, error: error instanceof Error ? error.message : String(error) });
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
    const symbol = row.symbol.toUpperCase();
    const name = row.name.toUpperCase();

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
    best.peaEligibility.status
  );

  return {
    symbol: best.symbol.toUpperCase(),
    name: best.name,
    score: eligible ? 0.82 : 0.55
  };
}

/** Référence d'import d'un avis : préfixée pour ne jamais rencontrer une autre origine. */
export function avisImportRef(reference: string | undefined) {
  return reference ? `pdf:${reference}` : undefined;
}

type AvisImportInput = Parameters<typeof portfolioService.importAvisTransaction>[0];

/**
 * Confirme l’import des opérations prévisualisées.
 *
 * Les lignes sont d'abord validées (schéma, actif Yahoo), puis toutes écrites dans une seule
 * transaction SQLite, dans l'ordre chronologique, avec un contrôle espèces unique sur le lot : les
 * ventes du lot financent ses achats et un manque de fonds annule tout l'import. Le versement de
 * financement n'est enregistré que s'il a été confirmé (`funding`). Un avis déjà importé (même
 * référence d'ordre) est ignoré.
 */
export async function confirmAvisOperesImport(rows: unknown[], funding?: CashFundingInput) {
  const imported: string[] = [];
  const skipped: string[] = [];
  const errors: { line: number; message: string }[] = [];
  const prepared: { line: number; input: AvisImportInput }[] = [];

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
      prepared.push({
        line: index + 1,
        input: {
          symbol,
          name,
          currency: row.devise,
          type: row.sensOperation === "vente" ? "sell" : "buy",
          quantity: row.quantite,
          price: row.coursExecute,
          tradedAt: row.dateExecution ?? new Date().toISOString(),
          sourceFileName: row.sourceFileName ?? null,
          assetName: row.nomValeur ?? name,
          isin: row.isin ?? null,
          ticker: symbol,
          totalFees: row.montantTotalFrais ?? null,
          rawTextSnippet: row.rawTextSnippet ?? null,
          importRef: avisImportRef(row.reference) ?? null
        }
      });
    } catch (error) {
      errors.push({ line: index + 1, message: importErrorMessage(error) });
    }
  }

  const userId = currentUserId();
  prepared.sort((a, b) => new Date(a.input.tradedAt).getTime() - new Date(b.input.tradedAt).getTime() || a.line - b.line);
  const effectiveAt = batchFundingDate(userId, prepared.map(({ input }) => new Date(input.tradedAt).toISOString()));
  withCashGuard(userId, { effectiveAt, fundable: true, funding }, () => {
    for (const { line, input } of prepared) {
      try {
        portfolioService.importAvisTransaction(input);
        imported.push(input.symbol);
      } catch (error) {
        if (error instanceof HttpError && error.message === alreadyImportedMessage) skipped.push(`${input.assetName ?? input.symbol} (deja importe)`);
        else errors.push({ line, message: importErrorMessage(error) });
      }
    }
  });

  return { imported, skipped, errors };
}

function importErrorMessage(error: unknown) {
  return error instanceof z.ZodError ? formatValidationError(error) : error instanceof Error ? error.message : "Import impossible.";
}
