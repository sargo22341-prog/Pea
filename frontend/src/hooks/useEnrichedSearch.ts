import type { EnrichedSearchResult } from "@pea/shared";
import { useEffect, useRef, useState } from "react";
import { i18n } from "../i18n";
import { api } from "../lib/api";

export function useEnrichedSearch({ localPeaSearchEnabled }: { localPeaSearchEnabled?: boolean | undefined }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EnrichedSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastQueryRef = useRef("");

  const normalizedQuery = query.trim();
  // En dessous de deux caracteres, aucune recherche n'est active : resultats et chargement sont derives.
  const searchActive = normalizedQuery.length >= 2;

  useEffect(() => {
    if (!searchActive) {
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
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : i18n.t("errors:networkSearch"));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, localPeaSearchEnabled ? 150 : 800);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [localPeaSearchEnabled, normalizedQuery, searchActive]);

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
    loading: searchActive && loading,
    query,
    results: searchActive ? results : [],
    setError,
    setQuery,
    toggleWatchlist
  };
}
