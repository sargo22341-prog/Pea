import { useCallback, useEffect, useRef, useState } from "react";
import { i18n } from "../i18n";
import { useLatestRef } from "./useLatestRef";

/**
 * Hook async avec :
 *   - `loaderRef` toujours frais (via `useLatestRef`) — on appelle la dernière fonction passée,
 *     pas une closure capturée.
 *   - Re-déclenchement uniquement quand `reloadKey` change (sinon stable, pas de boucle).
 *   - Anti-race via `requestId` : seul le dernier appel mute l'état React.
 *   - `AbortSignal` propagé au loader pour fetch cancel.
 *   - Stale-while-revalidate : un `reload()` manuel (SSE, focus, après mutation) garde les
 *     données affichées et ne repasse pas `loading` à `true`. Seuls le premier chargement et un
 *     changement de `reloadKey` affichent l'état de chargement. Cela évite de démonter les
 *     sous-arbres conditionnés par `loading` (skeletons, sections enfants) à chaque rafraîchissement.
 *
 * Convention d'usage :
 *   - `loader` peut être inline (`() => api.foo()`), il sera lu via ref donc pas de
 *     re-déclenchement à chaque render.
 *   - Pour relancer manuellement, appelez `reload()` (le requestId est incrémenté).
 *   - Pour relancer sur changement de paramètre, passez le paramètre comme `reloadKey`.
 */
export function useAsync<T>(loader: (signal?: AbortSignal) => Promise<T>, reloadKey?: unknown) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeReloadKey, setActiveReloadKey] = useState(reloadKey);
  const loaderRef = useLatestRef(loader);
  const requestIdRef = useRef(0);
  const hasDataRef = useRef(false);

  // Changement de `reloadKey` : l'etat de chargement est ajuste pendant le rendu, pas dans l'effet,
  // pour eviter un rendu en cascade (seules des mises a jour asynchrones partent de l'effet).
  if (!Object.is(activeReloadKey, reloadKey)) {
    setActiveReloadKey(reloadKey);
    setLoading(true);
    setError(null);
  }

  const fetchData = useCallback(async (signal: AbortSignal | undefined) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isCurrent = () => !signal?.aborted && requestId === requestIdRef.current;
    try {
      const result = await loaderRef.current(signal);
      if (isCurrent()) {
        hasDataRef.current = true;
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : i18n.t("errors:unknown"));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [loaderRef]);

  const reload = useCallback((signal?: AbortSignal) => {
    if (!hasDataRef.current) setLoading(true);
    setError(null);
    return fetchData(signal);
  }, [fetchData]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => { controller.abort(); };
  }, [reloadKey, fetchData]);

  return { data, error, loading, reload };
}
