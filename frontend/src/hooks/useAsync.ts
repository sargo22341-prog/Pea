import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "./useLatestRef";

/**
 * Hook async avec :
 *   - `loaderRef` toujours frais (via `useLatestRef`) — on appelle la dernière fonction passée,
 *     pas une closure capturée.
 *   - Re-déclenchement uniquement quand `reloadKey` change (sinon stable, pas de boucle).
 *   - Anti-race via `requestId` : seul le dernier appel mute l'état React.
 *   - `AbortSignal` propagé au loader pour fetch cancel.
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
  const loaderRef = useLatestRef(loader);
  const requestIdRef = useRef(0);

  const reload = useCallback(async (signal?: AbortSignal) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current(signal);
      if (!signal?.aborted && requestId === requestIdRef.current) setData(result);
    } catch (err) {
      if (!signal?.aborted && requestId === requestIdRef.current) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      }
    } finally {
      if (!signal?.aborted && requestId === requestIdRef.current) setLoading(false);
    }
  }, [loaderRef]);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reloadKey, reload]);

  return { data, error, loading, reload };
}
