import { MARKETS_REFRESH_INTERVAL_MS } from "@pea/shared";
import { useEffect } from "react";
import { useAsync } from "../../../hooks/useAsync";
import { api } from "../../../lib/api";

/**
 * Vue d'ensemble des marchés, rechargée à l'intervalle du cache des cotations tant que la page
 * est visible : un onglet en arrière-plan ne consomme aucun appel.
 */
export function useMarketOverview() {
  const overview = useAsync((signal) => api.marketOverview(signal), undefined, { cacheKey: "market-overview" });
  const { reload } = overview;

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, MARKETS_REFRESH_INTERVAL_MS);
    return () => { window.clearInterval(timer); };
  }, [reload]);

  return overview;
}
