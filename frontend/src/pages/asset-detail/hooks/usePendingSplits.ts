import type { SplitDecision, UserAssetSplit } from "@pea/shared";
import { useState } from "react";
import { useAsync } from "../../../hooks/useAsync";
import { api } from "../../../lib/api";

/**
 * Divisions d'actions en attente de décision pour l'actif affiché. Après une décision, les
 * divisions et la fiche sont rechargées : la position est recalculée côté serveur.
 */
export function usePendingSplits(symbol: string, reloadAsset: () => Promise<void>) {
  const splits = useAsync((signal) => api.splits(symbol, signal), symbol);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(split: UserAssetSplit, decision: SplitDecision) {
    setDecidingId(split.id);
    setError(null);
    try {
      await api.decideSplit(split.id, decision);
      await Promise.all([splits.reload(), reloadAsset()]);
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : String(decisionError));
    } finally {
      setDecidingId(null);
    }
  }

  return {
    pending: (splits.data ?? []).filter((split) => split.status === "pending"),
    decide,
    decidingId,
    error
  };
}
