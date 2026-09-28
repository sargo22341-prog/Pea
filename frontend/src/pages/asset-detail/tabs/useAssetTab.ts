import { useSearchParams } from "react-router-dom";
import { ASSET_TAB_PARAM, DEFAULT_ASSET_TAB, resolveAssetTab, type AssetTabId } from "./asset-tabs";

/** Onglet actif de la fiche, lu et écrit dans l'URL (`?tab=fundamentals`). */
export function useAssetTab(available: readonly AssetTabId[]) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveAssetTab(searchParams.get(ASSET_TAB_PARAM), available);

  function selectTab(tab: AssetTabId) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (tab === DEFAULT_ASSET_TAB) next.delete(ASSET_TAB_PARAM);
      else next.set(ASSET_TAB_PARAM, tab);
      return next;
    });
  }

  return { activeTab, selectTab };
}
