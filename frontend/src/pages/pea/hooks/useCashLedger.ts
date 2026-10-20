import type { CashLedgerDto } from "@pea/shared";
import { useMemo, useState } from "react";
import { useAsync } from "../../../hooks/useAsync";
import { api } from "../../../lib/api";

export interface LedgerAsset {
  positionId: number;
  symbol: string;
  name: string;
}

/** Journal espèces de l'utilisateur ; une écriture renvoie le journal à jour, qui remplace l'affiché. */
export function useCashLedger() {
  const ledger = useAsync((signal) => api.cashLedger(signal), "cash-ledger");
  const [override, setOverride] = useState<CashLedgerDto | null>(null);
  const data = override ?? ledger.data;

  // Actifs déjà négociés : cibles possibles d'un dividende encaissé ou de frais.
  const assets = useMemo(() => {
    const byId = new Map<number, LedgerAsset>();
    for (const entry of data?.entries ?? []) {
      if (entry.positionId !== undefined && entry.symbol && (entry.kind === "buy" || entry.kind === "sell")) {
        byId.set(entry.positionId, { positionId: entry.positionId, symbol: entry.symbol, name: entry.name ?? entry.symbol });
      }
    }
    return [...byId.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [data]);

  return { assets, data, error: ledger.error, loading: ledger.loading && !data, replace: setOverride, reload: async () => { setOverride(null); await ledger.reload(); } };
}
