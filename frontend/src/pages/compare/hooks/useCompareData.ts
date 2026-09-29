import type { CompareAssetDto } from "@pea/shared";
import { useAsync } from "../../../hooks/useAsync";
import { api } from "../../../lib/api";
import { canCompare } from "../compare-symbols";

/** Colonnes du comparateur ; aucune requête tant que la sélection compte moins de deux actifs. */
export function useCompareData(symbols: readonly string[]) {
  const ready = canCompare(symbols);
  return useAsync<CompareAssetDto[]>(
    (signal) => (ready ? api.compareAssets(symbols, signal) : Promise.resolve([])),
    symbols.join(",")
  );
}
