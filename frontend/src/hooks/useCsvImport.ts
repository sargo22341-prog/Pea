import type { BoursoramaImportRow, BoursoramaUpdateRow } from "@pea/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { notifyDataConstructionChanged } from "../lib/dataConstruction";

type ImportError = { line: number; message: string };

function rowsWithImportErrors<T extends { line: number; errors: string[] }>(rows: T[], errors: ImportError[]) {
  if (!errors.length) return rows.map((row) => ({ ...row, errors: row.errors.filter((message) => !message.startsWith("Confirmation:")) }));
  return rows.map((row, index) => {
    const lineErrors = errors
      .filter((error) => error.line === row.line || error.line === index + 1)
      .map((error) => `Confirmation: ${error.message}`);
    const previousErrors = row.errors.filter((message) => !message.startsWith("Confirmation:"));
    return { ...row, errors: [...previousErrors, ...lineErrors] };
  });
}

export function useCsvImport() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<BoursoramaImportRow[]>([]);
  const [updateRows, setUpdateRows] = useState<BoursoramaUpdateRow[]>([]);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function importCsv(file?: File) {
    const content = await readCsv(file);
    if (!content) return;
    setLoading(true);
    setMessage(null);
    try {
      const previewRows = await api.previewBoursorama(content);
      setRows(previewRows);
      setUpdateRows([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function previewUpdate(file?: File) {
    const content = await readCsv(file);
    if (!content) return;
    setLoading(true);
    setMessage(null);
    try {
      setUpdateRows(await api.previewBoursoramaUpdate(content));
      setRows([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preview impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmUpdate() {
    if (updateRows.some((row) => row.proposedAction === "delete") && !window.confirm("Confirmer les suppressions de positions absentes du CSV ?")) return;
    setLoading(true);
    try {
      const result = await api.confirmBoursoramaUpdate(updateRows);
      if (result.isPreparing && result.jobId) notifyDataConstructionChanged();
      setMessage(`${result.imported.length} changement(s) applique(s), ${result.skipped.length} ignore(s), ${result.errors.length} erreur(s).`);
      setUpdateRows((current) => rowsWithImportErrors(current, result.errors));
      if (result.errors.length === 0) navigate("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Validation impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmImport() {
    setLoading(true);
    try {
      const result = await api.confirmBoursorama(rows.map((row) => ({ ...row, action: row.action ?? "merge" })));
      if (result.isPreparing && result.jobId) notifyDataConstructionChanged();
      setMessage(`${result.imported.length} ligne(s) importee(s), ${result.skipped.length} ignoree(s), ${result.errors.length} erreur(s).`);
      setRows((current) => rowsWithImportErrors(current, result.errors));
      if (result.errors.length === 0) navigate("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Validation impossible.");
    } finally {
      setLoading(false);
    }
  }

  function updateImportRow(index: number, patch: Partial<BoursoramaImportRow>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function updateSyncRow(row: BoursoramaUpdateRow, patch: Partial<BoursoramaUpdateRow>) {
    setUpdateRows((current) => current.map((item) => (item === row ? { ...item, ...patch } : item)));
  }

  const visibleUpdateRows = showUnchanged ? updateRows : updateRows.filter((row) => row.proposedAction !== "unchanged");

  return {
    confirmImport,
    confirmUpdate,
    importCsv,
    loading,
    message,
    previewUpdate,
    rows,
    setShowUnchanged,
    showUnchanged,
    updateImportRow,
    updateRows,
    updateSyncRow,
    visibleUpdateRows
  };
}

async function readCsv(file?: File) {
  if (!file) return undefined;
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  return utf8.includes("ÃƒÂ¯Ã‚Â¿Ã‚Â½") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
}
