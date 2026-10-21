import type { CashStatementLinePreview, CashStatementsImportResult, CashStatementsPreviewDto } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { notifyDividendsChanged } from "../../../../components/common/cash/useDividendProposals";
import { api } from "../../../../lib/api";

export interface CashLineChoice {
  apply: boolean;
  /** Élément choisi pour une ligne ambiguë. */
  targetId?: string | undefined;
  /** Position d'un coupon à créer. */
  positionId?: number | undefined;
}

/** Lignes qui attendent une décision : rapprocher, choisir parmi plusieurs, ou créer. */
export function isActionable(line: CashStatementLinePreview) {
  return line.case === "verify" || line.case === "ambiguous" || line.case === "create";
}

/**
 * Choix par défaut : vérifier ce qui correspond sans ambiguïté et créer ce qui manque. Une
 * ambiguïté ou un coupon dont la position est inconnue attendent un choix explicite.
 */
function defaultChoice(line: CashStatementLinePreview): CashLineChoice {
  if (line.case === "ambiguous") return { apply: false };
  if (line.case === "create" && line.kind === "dividend") return { apply: false };
  return { apply: true };
}

/**
 * Import en lot des relevés espèces : aperçu par relevé, choix ligne à ligne, puis confirmation
 * qui renvoie les mêmes fichiers au serveur (relus, jamais conservés).
 */
export function useCashStatementsImport() {
  const { t } = useTranslation(["cash", "errors"]);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<CashStatementsPreviewDto | null>(null);
  const [choices, setChoices] = useState<Record<string, CashLineChoice>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CashStatementsImportResult | null>(null);

  function reset() {
    setFiles([]);
    setPreview(null);
    setChoices({});
  }

  async function run(action: () => Promise<void>) {
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("errors:unknown"));
    } finally {
      setLoading(false);
    }
  }

  async function load(selected: FileList | null | undefined) {
    const pdfFiles = Array.from(selected ?? []);
    if (!pdfFiles.length) return;
    setResult(null);
    await run(async () => {
      const next = await api.previewCashStatements(pdfFiles);
      setFiles(pdfFiles);
      setPreview(next);
      setChoices(Object.fromEntries(next.statements.flatMap((statement) => statement.lines.filter(isActionable).map((line) => [line.key, defaultChoice(line)] as const))));
    });
  }

  async function confirm() {
    await run(async () => {
      const lines = Object.entries(choices).map(([key, choice]) => ({ key, apply: choice.apply, targetId: choice.targetId, positionId: choice.positionId }));
      setResult(await api.confirmCashStatements(files, { lines }));
      reset();
      notifyDividendsChanged();
    });
  }

  return {
    preview,
    choices,
    loading,
    error,
    result,
    load,
    confirm,
    cancel: reset,
    choose: (key: string, choice: CashLineChoice) => { setChoices((current) => ({ ...current, [key]: choice })); }
  };
}

export type CashStatementsImportState = ReturnType<typeof useCashStatementsImport>;
