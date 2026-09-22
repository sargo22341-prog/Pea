import { useEffect } from "react";
import { suspendPullToRefresh } from "../lib/pull-to-refresh";

/**
 * Désactive le geste natif « tirer pour recharger » tant que le composant est monté.
 *
 * Utilisé par les fenêtres modales : leur contenu défile au-dessus de la page et peut contenir
 * une saisie non enregistrée qu'un rechargement complet détruirait.
 */
export function usePullToRefreshSuspended(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    return suspendPullToRefresh();
  }, [active]);
}
