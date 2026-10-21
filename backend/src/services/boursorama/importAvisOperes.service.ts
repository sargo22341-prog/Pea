import type { CashFundingInput, ParsedAvisOperation, TradeImportResult } from "@pea/shared";
import { z } from "zod";
import { config } from "../../config.js";
import { cashRepository } from "../../repositories/cash/cash.repository.js";
import { portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { currentUserId } from "../auth/user-context.js";
import { portfolioService } from "../portfolio/portfolio.service.js";
import { parseAvisOperesText } from "./avisOperesParser.service.js";
import { extractPdfText } from "./pdf-text-extractor.js";
import { batchFundingDate, withCashGuard } from "../cash/cash-guard.js";
import { alreadyImportedMessage } from "../portfolio/portfolio-write.service.js";
import { assertDistinctUploads } from "../shared/upload-fingerprint.js";
import { toUtcIso } from "../timezone/wall-clock.js";
import { resolveAssetFromOperation } from "./avis-asset-resolution.js";
import { isDuplicateOfExistingTransaction, markDuplicatesWithinBatch, withDuplicateWarning } from "./avis-duplicates.js";
import { assertYahooSymbolExists, confirmOperationSchema, formatValidationError } from "./avis-import-validation.js";
import { alreadyRecordedMessage, ambiguousRecordedMessage, avisImportRef, avisTradeIdentity, completeExistingTrade, findExistingTrade } from "./avis-trade-linking.js";

export interface PdfUpload {
  fileName: string;
  buffer: Buffer;
}

/**
 * Prépare l’import d’un ou plusieurs avis d’opéré PDF.
 *
 * Extrait le texte, parse les opérations, tente de résoudre l’actif associé,
 * puis ajoute un avertissement si un doublon potentiel est détecté. Un même fichier fourni deux
 * fois dans le lot est refusé.
 */
export async function previewAvisOperesImport(
  files: PdfUpload[]
): Promise<ParsedAvisOperation[]> {
  const rows: ParsedAvisOperation[] = [];
  assertDistinctUploads(files);

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
 * Signale une opération qui semble déjà enregistrée et la propose à l'ignorance par défaut : même
 * référence d'ordre (déjà importée), opération identique (sa référence sera complétée à la
 * confirmation) ou doublon probable (même jour, quantité et sens).
 */
function markDuplicateWarning(operation: ParsedAvisOperation): ParsedAvisOperation {
  const userId = currentUserId();
  const ignored = (message?: string): ParsedAvisOperation => {
    const duplicate = withDuplicateWarning(operation);
    return { ...duplicate, action: "ignore", warnings: message ? [...duplicate.warnings, message] : duplicate.warnings };
  };
  const importRef = avisImportRef(operation.reference);
  if (importRef && cashRepository.tradeImportRefExists(userId, importRef)) return ignored(alreadyImportedMessage);
  const symbol = operation.selectedSymbol ?? operation.resolvedAsset?.symbol;
  const position = symbol ? portfolioRepository.findPositionBySymbol(symbol.toUpperCase(), userId) : undefined;
  if (!symbol || !position) return { ...operation, action: "import" };
  const identity = avisTradeIdentity(operation);
  const match = identity ? findExistingTrade(userId, symbol, identity) : { kind: "none" as const };
  if (match.kind === "unique") return ignored(alreadyRecordedMessage);
  if (match.kind === "ambiguous") return ignored(ambiguousRecordedMessage);
  const existing = portfolioService.listTransactions(position.id);
  return isDuplicateOfExistingTransaction(operation, existing, config.appTimezone) ? ignored() : { ...operation, action: "import" };
}

type AvisImportInput = Parameters<typeof portfolioService.importAvisTransaction>[0];
type ConfirmRow = z.infer<typeof confirmOperationSchema>;

interface ImportOutcome {
  imported: string[];
  skipped: string[];
  linked: string[];
  errors: { line: number; message: string }[];
}

function rowLabel(row: ConfirmRow, line: number) {
  return row.nomValeur ?? row.selectedSymbol ?? `ligne ${line}`;
}

/**
 * Rapproche l'avis d'une opération déjà enregistrée : une opération identique unique reçoit la
 * référence d'ordre et l'ISIN de l'avis, plusieurs candidates sont signalées. Vrai si l'avis est
 * traité (rien ne doit être créé).
 */
function linkToExistingTrade(userId: number, row: ConfirmRow, line: number, outcome: ImportOutcome) {
  const identity = avisTradeIdentity(row);
  if (!row.selectedSymbol || !identity) return false;
  const match = findExistingTrade(userId, row.selectedSymbol, identity);
  if (match.kind === "none") return false;
  if (match.kind === "ambiguous") outcome.errors.push({ line, message: ambiguousRecordedMessage });
  else {
    completeExistingTrade(match, identity, row.isin);
    outcome.linked.push(rowLabel(row, line));
  }
  return true;
}

async function prepareRow(row: ConfirmRow): Promise<AvisImportInput> {
  if (!row.selectedSymbol) throw new Error("Actif non resolu.");
  if (row.sensOperation === "inconnu") throw new Error("Sens achat/vente requis.");
  const tradedAt = toUtcIso(row.dateExecution ?? new Date().toISOString(), config.appTimezone);
  if (!tradedAt) throw new Error("Date de transaction invalide.");
  const symbol = row.selectedSymbol.toUpperCase();
  await assertYahooSymbolExists(symbol);
  const name = row.selectedAssetName || row.nomValeur || symbol;
  return {
    symbol,
    name,
    currency: row.devise,
    type: row.sensOperation === "vente" ? "sell" : "buy",
    quantity: row.quantite,
    price: row.coursExecute,
    tradedAt,
    sourceFileName: row.sourceFileName ?? null,
    assetName: row.nomValeur ?? name,
    isin: row.isin ?? null,
    ticker: symbol,
    totalFees: row.montantTotalFrais ?? null,
    rawTextSnippet: row.rawTextSnippet ?? null,
    importRef: avisImportRef(row.reference) ?? null,
    confirmDuplicate: row.confirmDuplicate === true
  };
}

/**
 * Confirme l’import des opérations prévisualisées.
 *
 * Les lignes sont d'abord validées (schéma, actif Yahoo), puis toutes écrites dans une seule
 * transaction SQLite, dans l'ordre chronologique, avec un contrôle espèces unique sur le lot : les
 * ventes du lot financent ses achats et un manque de fonds annule tout l'import. Le versement de
 * financement n'est enregistré que s'il a été confirmé (`funding`). Aucun avis ne crée de doublon :
 * une référence d'ordre déjà importée est ignorée, et une opération identique déjà enregistrée
 * (importée avant la référence d'ordre, ou saisie à la main) reçoit la référence de l'avis au lieu
 * d'être recréée, même pour une ligne ignorée. Seul `confirmDuplicate` crée une seconde opération.
 */
export async function confirmAvisOperesImport(rows: unknown[], funding?: CashFundingInput): Promise<TradeImportResult> {
  const outcome: ImportOutcome = { imported: [], skipped: [], linked: [], errors: [] };
  const prepared: { line: number; row: ConfirmRow; input: AvisImportInput }[] = [];
  const ignored: { line: number; row: ConfirmRow }[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const line = index + 1;
    try {
      const row = confirmOperationSchema.parse(rows[index]);
      if (row.action === "ignore") ignored.push({ line, row });
      else prepared.push({ line, row, input: await prepareRow(row) });
    } catch (error) {
      outcome.errors.push({ line, message: importErrorMessage(error) });
    }
  }

  const userId = currentUserId();
  prepared.sort((a, b) => Date.parse(a.input.tradedAt) - Date.parse(b.input.tradedAt) || a.line - b.line);
  const effectiveAt = batchFundingDate(userId, prepared.map(({ input }) => input.tradedAt));
  withCashGuard(userId, { effectiveAt, fundable: true, funding }, () => {
    for (const { line, row, input } of prepared) {
      try {
        if (input.importRef && cashRepository.tradeImportRefExists(userId, input.importRef)) throw new HttpError(409, alreadyImportedMessage);
        if (!input.confirmDuplicate && linkToExistingTrade(userId, row, line, outcome)) continue;
        portfolioService.importAvisTransaction(input);
        outcome.imported.push(input.symbol);
      } catch (error) {
        if (error instanceof HttpError && error.message === alreadyImportedMessage) outcome.skipped.push(`${input.assetName ?? input.symbol} (deja importe)`);
        else outcome.errors.push({ line, message: importErrorMessage(error) });
      }
    }
    for (const { line, row } of ignored) {
      const importRef = avisImportRef(row.reference);
      const alreadyImported = importRef !== undefined && cashRepository.tradeImportRefExists(userId, importRef);
      if (alreadyImported || !linkToExistingTrade(userId, row, line, outcome)) outcome.skipped.push(rowLabel(row, line));
    }
  });

  return outcome;
}

function importErrorMessage(error: unknown) {
  return error instanceof z.ZodError ? formatValidationError(error) : error instanceof Error ? error.message : "Import impossible.";
}
