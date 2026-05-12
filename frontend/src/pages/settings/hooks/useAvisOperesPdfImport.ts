import type { ParsedAvisOperation } from "@pea/shared";
import { useState } from "react";
import { api } from "../../../lib/api";
import { notifyDataConstructionChanged } from "../../../lib/dataConstruction";

type ImportError = { line: number; message: string };

function rowsWithImportErrors(rows: ParsedAvisOperation[], errors: ImportError[]) {
  if (!errors.length) return rows.map((row) => ({ ...row, errors: [] }));
  return rows.map((row, index) => ({
    ...row,
    errors: errors.filter((error) => error.line === index + 1).map((error) => error.message)
  }));
}

export function useAvisOperesPdfImport() {
  const [rows, setRows] = useState<ParsedAvisOperation[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function preview(files?: FileList | null) {
    const pdfFiles = Array.from(files ?? []);
    if (!pdfFiles.length) return;
    setLoading(true);
    setMessage(null);
    try {
      setRows((await api.previewAvisOperesPdf(pdfFiles)).map((row) => ({ ...row, action: "import" })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Extraction PDF impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    setLoading(true);
    try {
      const result = await api.confirmAvisOperesPdf(rows);
      if (result.isPreparing && result.jobId) notifyDataConstructionChanged();
      setMessage(`${result.imported.length} operation(s) importee(s), ${result.skipped.length} ignoree(s), ${result.errors.length} erreur(s).`);
      setRows((current) => result.errors.length ? rowsWithImportErrors(current, result.errors) : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import PDF impossible.");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(index: number, patch: Partial<ParsedAvisOperation>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  return { confirm, loading, message, preview, removeRow, rows, updateRow };
}
