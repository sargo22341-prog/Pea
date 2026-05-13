import { useCallback, useEffect, useRef, useState } from "react";

export function useAsync<T>(loader: (signal?: AbortSignal) => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  const requestIdRef = useRef(0);
  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const reload = useCallback(async (signal?: AbortSignal) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current(signal);
      if (!signal?.aborted && requestId === requestIdRef.current) setData(result);
    } catch (err) {
      if (!signal?.aborted && requestId === requestIdRef.current) setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      if (!signal?.aborted && requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [depsKey, reload]);

  return { data, error, loading, reload };
}
