import type { ParsedAvisOperation } from "@pea/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export function useAvisOperesPdfImport() {
  const navigate = useNavigate();
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
      setMessage(`${result.imported.length} operation(s) importee(s), ${result.skipped.length} ignoree(s), ${result.errors.length} erreur(s).`);
      if (result.errors.length === 0) navigate("/");
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
