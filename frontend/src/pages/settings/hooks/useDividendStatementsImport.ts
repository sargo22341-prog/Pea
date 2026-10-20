import type { DividendStatementLinePreview, DividendStatementsImportResult, DividendStatementsPreviewDto } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { notifyDividendsChanged } from "../../../components/common/cash/useDividendProposals";
import { api } from "../../../lib/api";

export interface LineChoice {
  apply: boolean;
  positionId?: number | undefined;
}

/** Cas applicables ligne à ligne ; les lignes antérieures à l'état initial passent par la certification groupée. */
const APPLICABLE = new Set<DividendStatementLinePreview["case"]>(["certify", "mismatch", "proposal", "create", "unknown_asset"]);

export function isApplicable(line: DividendStatementLinePreview) {
  return APPLICABLE.has(line.case);
}

/**
 * Choix par défaut : appliquer ce qui ne modifie aucun montant enregistré. Une correction, un
 * doublon possible ou un ISIN inconnu attendent une décision explicite.
 */
function defaultChoice(line: DividendStatementLinePreview): LineChoice {
  return { apply: (line.case === "certify" || line.case === "proposal" || line.case === "create") && !line.possibleDuplicate };
}

/**
 * Import en lot des relevés de coupons : aperçu groupé par relevé, choix ligne à ligne, puis
 * confirmation qui renvoie les mêmes fichiers au serveur (relus, jamais conservés).
 */
export function useDividendStatementsImport() {
  const { t } = useTranslation(["cash", "errors"]);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<DividendStatementsPreviewDto | null>(null);
  const [choices, setChoices] = useState<Record<string, LineChoice>>({});
  const [certifyOpening, setCertifyOpening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DividendStatementsImportResult | null>(null);

  function reset() {
    setFiles([]);
    setPreview(null);
    setChoices({});
    setCertifyOpening(false);
  }

  async function load(selected: FileList | null | undefined) {
    const pdfFiles = Array.from(selected ?? []);
    if (!pdfFiles.length) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const next = await api.previewDividendStatements(pdfFiles);
      setFiles(pdfFiles);
      setPreview(next);
      setChoices(Object.fromEntries(next.statements.flatMap((statement) => statement.lines.filter(isApplicable).map((line) => [line.key, defaultChoice(line)]))));
      setCertifyOpening(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("errors:unknown"));
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const lines = Object.entries(choices).map(([key, choice]) => ({ key, apply: choice.apply, positionId: choice.positionId }));
      setResult(await api.confirmDividendStatements(files, { lines, certifyOpening }));
      reset();
      notifyDividendsChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("errors:unknown"));
    } finally {
      setLoading(false);
    }
  }

  return {
    preview,
    choices,
    certifyOpening,
    loading,
    error,
    result,
    load,
    confirm,
    cancel: reset,
    setCertifyOpening,
    choose: (key: string, choice: LineChoice) => { setChoices((current) => ({ ...current, [key]: choice })); }
  };
}

export type DividendStatementsImportState = ReturnType<typeof useDividendStatementsImport>;
