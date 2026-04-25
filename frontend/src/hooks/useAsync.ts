/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useState } from "react";

export function useAsync<T>(loader: (signal?: AbortSignal) => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await loader(signal);
      if (!signal?.aborted) setData(result);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  return { data, error, loading, reload };
}
