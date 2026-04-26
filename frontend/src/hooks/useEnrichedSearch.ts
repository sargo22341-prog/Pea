import type { EnrichedSearchResult } from "@pea/shared";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export function useEnrichedSearch({ localPeaSearchEnabled }: { localPeaSearchEnabled?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EnrichedSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastQueryRef = useRef("");

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      lastQueryRef.current = "";
      return;
    }

    if (normalizedQuery === lastQueryRef.current) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const nextResults = await api.enrichedSearch(normalizedQuery, controller.signal);
        lastQueryRef.current = normalizedQuery;
        setResults(nextResults);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Recherche impossible");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, localPeaSearchEnabled ? 150 : 800);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [localPeaSearchEnabled, query]);

  async function toggleWatchlist(item: EnrichedSearchResult) {
    if (item.isInWatchlist) {
      await api.removeWatchlist(item.symbol);
    } else {
      await api.addWatchlist(item);
    }
    setResults((current) =>
      current.map((row) => (row.symbol === item.symbol ? { ...row, isInWatchlist: !row.isInWatchlist } : row))
    );
  }

  function clearResults() {
    setResults([]);
  }

  return {
    clearResults,
    error,
    loading,
    query,
    results,
    setError,
    setQuery,
    toggleWatchlist
  };
}
