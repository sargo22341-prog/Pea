import { useMemo } from "react";
import { useAsync } from "../../../../hooks/useAsync";
import { api } from "../../../../lib/api";

const NO_PENDING_SPLIT: ReadonlySet<string> = new Set();

/**
 * Symboles du portefeuille dont une division d'action attend la décision de l'utilisateur.
 * Une erreur de chargement n'affiche simplement aucun badge : la bannière de la fiche actif
 * reste le point de décision.
 */
export function usePendingSplitSymbols(): ReadonlySet<string> {
  const splits = useAsync((signal) => api.splits(undefined, signal));
  return useMemo(() => {
    if (!splits.data) return NO_PENDING_SPLIT;
    return new Set(splits.data.filter((split) => split.status === "pending").map((split) => split.symbol.toUpperCase()));
  }, [splits.data]);
}
