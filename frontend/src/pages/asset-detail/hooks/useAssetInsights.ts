import type { AssetInsights } from "@pea/shared";
import { useFeatureEnabled } from "../../../contexts/feature-flags-context";
import { useAsync } from "../../../hooks/useAsync";
import { api } from "../../../lib/api";

/**
 * Signaux techniques de l'actif, partagés par l'Aperçu et le graphique (supports / résistances).
 * Aucune requête quand l'administrateur a coupé la fonctionnalité.
 */
export function useAssetInsights(symbol: string): AssetInsights | null {
  const enabled = useFeatureEnabled("insights");
  const insights = useAsync((signal) => (enabled ? api.insights(symbol, signal) : Promise.resolve(null)), `${symbol}:${String(enabled)}`);
  return enabled ? insights.data ?? null : null;
}
