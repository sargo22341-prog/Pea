import { HttpError } from "../../../utils/http-error.js";
import { extractPdfText } from "../../boursorama/pdf-text-extractor.js";
import { parseDividendStatement, type ParsedDividendStatement } from "./parser/statement-parser.js";
import { StatementFormatError } from "./parser/statement-text.js";

/** Un relevé mensuel pèse quelques dizaines de kilo-octets : au-delà, le fichier n'en est pas un. */
export const MAX_STATEMENT_FILE_BYTES = 2 * 1024 * 1024;
/** Plusieurs années de relevés mensuels (plus de 60) peuvent être importées en une fois. */
export const MAX_STATEMENT_FILES = 120;

export const notAPdfMessage = "Seuls les relevés au format PDF sont acceptés.";

const pdfSignature = Buffer.from("%PDF-", "latin1");

export interface StatementUpload {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export type ReadStatement = { fileName: string; statement: ParsedDividendStatement; error?: undefined } | { fileName: string; statement?: undefined; error: string };

/** Type MIME, extension et signature `%PDF-` : un autre fichier est refusé avant toute analyse. */
export function assertPdf(file: StatementUpload) {
  const isPdf = file.mimeType === "application/pdf" && file.fileName.toLowerCase().endsWith(".pdf") && file.buffer.subarray(0, pdfSignature.length).equals(pdfSignature);
  if (!isPdf) throw new HttpError(400, notAPdfMessage);
  if (file.buffer.length > MAX_STATEMENT_FILE_BYTES) throw new HttpError(400, "Fichier trop lourd.");
}

/**
 * Lit un relevé en mémoire (texte extrait dans un processus enfant) ; le PDF n'est jamais écrit
 * sur disque. Un relevé illisible ou incohérent est signalé, pas importé.
 */
export async function readStatement(file: StatementUpload): Promise<ReadStatement> {
  assertPdf(file);
  try {
    return { fileName: file.fileName, statement: parseDividendStatement(await extractPdfText(file.buffer)) };
  } catch (error) {
    if (error instanceof StatementFormatError || error instanceof HttpError) return { fileName: file.fileName, error: error.message };
    throw error;
  }
}

/** Version stricte pour la vérification d'un seul dividende : une erreur de lecture est une 400. */
export async function readSingleStatement(file: StatementUpload) {
  const read = await readStatement(file);
  if (read.error !== undefined) throw new HttpError(400, read.error);
  return read.statement;
}
