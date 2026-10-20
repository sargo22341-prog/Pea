import type { CashLedgerDto, CashLedgerEntry } from "@pea/shared";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../lib/api";

function positionDividends(ledger: CashLedgerDto, positionId: number) {
  return ledger.entries.filter((entry) => entry.kind === "dividend" && entry.positionId === positionId);
}

/** Dividendes encaissés d'une position, lus dans le journal espèces (du plus récent au plus ancien). */
export function usePositionDividends(positionId: number) {
  const { t } = useTranslation("errors");
  const [dividends, setDividends] = useState<CashLedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const replace = useCallback((ledger: CashLedgerDto) => { setDividends(positionDividends(ledger, positionId)); }, [positionId]);

  useEffect(() => {
    let alive = true;
    api.cashLedger()
      .then((ledger) => { if (alive) replace(ledger); })
      .catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : t("loadFailed")); });
    return () => { alive = false; };
  }, [replace, t]);

  return { dividends, error, replace };
}
