import type { CashLedgerDto, DividendStatementCheck } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../lib/api";
import { notifyDividendsChanged } from "../useDividendProposals";

/**
 * Vérification d'un dividende enregistré : « Vérifié manuellement », ou rapprochement avec le
 * relevé du mois (lecture sans écriture, puis certification confirmée). Chaque écriture prévient
 * la cloche, « Mon PEA » et le journal.
 */
export function useDividendVerification(movementId: number, onChanged?: (ledger: CashLedgerDto) => void) {
  const { t } = useTranslation("errors");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<DividendStatementCheck | null>(null);

  async function run<T>(action: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("unknown"));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function written(action: () => Promise<CashLedgerDto>) {
    const ledger = await run(action);
    if (!ledger) return false;
    onChanged?.(ledger);
    notifyDividendsChanged();
    return true;
  }

  return {
    busy,
    error,
    check,
    markManual: () => written(() => api.verifyDividend(movementId)),
    /** Lit le relevé joint ; rien n'est écrit tant que la certification n'est pas confirmée. */
    checkStatement: async (selected: File | undefined) => {
      if (!selected) return;
      setFile(selected);
      setCheck(null);
      const result = await run(() => api.checkDividendStatement(movementId, selected));
      if (result) setCheck(result);
    },
    certify: async (correct: boolean) => {
      if (!file) return;
      if (!(await written(() => api.certifyDividendStatement(movementId, file, correct)))) return;
      setCheck(null);
      setFile(null);
    }
  };
}
