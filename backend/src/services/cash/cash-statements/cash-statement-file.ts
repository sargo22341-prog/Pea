import { HttpError } from "../../../utils/http-error.js";
import { extractPdfText } from "../../boursorama/pdf-text-extractor.js";
import { assertPdf, type StatementUpload } from "../dividend-statements/statement-file.js";
import { parseCashStatement, type ParsedCashStatement } from "./parser/cash-statement-parser.js";
import { StatementFormatError } from "./parser/cash-statement-text.js";

export type ReadCashStatement = { fileName: string; statement: ParsedCashStatement; error?: undefined } | { fileName: string; statement?: undefined; error: string };

/**
 * Lit un relevé espèces en mémoire (texte extrait dans un processus enfant) ; le PDF n'est jamais
 * écrit sur disque ni conservé. Un relevé illisible ou incohérent est signalé, pas importé.
 */
export async function readCashStatement(file: StatementUpload): Promise<ReadCashStatement> {
  assertPdf(file);
  try {
    return { fileName: file.fileName, statement: parseCashStatement(await extractPdfText(file.buffer)) };
  } catch (error) {
    if (error instanceof StatementFormatError || error instanceof HttpError) return { fileName: file.fileName, error: error.message };
    throw error;
  }
}
