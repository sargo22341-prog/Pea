import type { BoursoramaImportRow, BoursoramaUpdateRow } from "@pea/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

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
    const result = await api.confirmBoursoramaUpdate(updateRows);
    setMessage(`${result.imported.length} changement(s) applique(s), ${result.skipped.length} ignore(s), ${result.errors.length} erreur(s).`);
    setLoading(false);
    if (result.errors.length === 0) navigate("/");
  }

  async function confirmImport() {
    setLoading(true);
    const result = await api.confirmBoursorama(rows.map((row) => ({ ...row, action: row.action ?? "merge" })));
    setMessage(`${result.imported.length} ligne(s) importee(s), ${result.skipped.length} ignoree(s), ${result.errors.length} erreur(s).`);
    setLoading(false);
    if (result.errors.length === 0) navigate("/");
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
