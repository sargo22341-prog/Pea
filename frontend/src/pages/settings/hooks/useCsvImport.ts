import type { BoursoramaImportRow, BoursoramaUpdateRow } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { notifyDataConstructionChanged } from "../../../lib/dataConstruction";

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
  const { t } = useTranslation(["settings"]);
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
      setMessage(error instanceof Error ? error.message : t("imports.importError", { ns: "settings" }));
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
      setMessage(error instanceof Error ? error.message : t("imports.previewError", { ns: "settings" }));
    } finally {
      setLoading(false);
    }
  }

  async function confirmUpdate() {
    if (updateRows.some((row) => row.proposedAction === "delete") && !window.confirm(t("imports.confirmDeleteMissing", { ns: "settings" }))) return;
    setLoading(true);
    try {
      const result = await api.confirmBoursoramaUpdate(updateRows);
      if (result.isPreparing && result.jobId) notifyDataConstructionChanged();
      setMessage(t("imports.confirmUpdateResult", { errors: result.errors.length, imported: result.imported.length, ns: "settings", skipped: result.skipped.length }));
      setUpdateRows((current) => rowsWithImportErrors(current, result.errors));
      if (result.errors.length === 0) navigate("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("imports.validationError", { ns: "settings" }));
    } finally {
      setLoading(false);
    }
  }

  async function confirmImport() {
    setLoading(true);
    try {
      const result = await api.confirmBoursorama(rows.map((row) => ({ ...row, action: row.action ?? "merge" })));
      if (result.isPreparing && result.jobId) notifyDataConstructionChanged();
      setMessage(t("imports.confirmImportResult", { errors: result.errors.length, imported: result.imported.length, ns: "settings", skipped: result.skipped.length }));
      setRows((current) => rowsWithImportErrors(current, result.errors));
      if (result.errors.length === 0) navigate("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("imports.validationError", { ns: "settings" }));
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
