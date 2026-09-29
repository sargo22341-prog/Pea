import type { ScreenerFilters, ScreenerQuery, ScreenerSortKey } from "@pea/shared";
import { useMemo, useState } from "react";
import { useAsync } from "../../../hooks/useAsync";
import { api } from "../../../lib/api";
import { screenerSearchParams } from "../../../lib/api-clients/screener-api";
import { DEFAULT_SCREENER_FILTERS } from "../screener-config";
import { useDebouncedValue } from "./useDebouncedValue";

/** Délai entre la dernière frappe dans un filtre et la nouvelle recherche. */
const FILTER_DEBOUNCE_MS = 300;

/** Filtres et tri du screener ; la recherche part après une courte pause de saisie. */
export function useScreener() {
  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_SCREENER_FILTERS);
  const [sort, setSort] = useState<ScreenerSortKey>("marketCap");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const query = useMemo<ScreenerQuery>(() => ({ filters, sort, direction }), [filters, sort, direction]);
  const debounced = useDebouncedValue(query, FILTER_DEBOUNCE_MS);
  const key = screenerSearchParams(debounced).toString();
  const results = useAsync((signal) => api.screener(debounced, signal), key);

  return {
    filters,
    sort,
    direction,
    results,
    updateFilter: <K extends keyof ScreenerFilters>(name: K, value: ScreenerFilters[K]) => {
      setFilters((current) => ({ ...current, [name]: value }));
    },
    replaceFilters: setFilters,
    /** Un clic sur la colonne déjà triée inverse le sens ; une nouvelle colonne part du plus grand. */
    sortBy: (next: ScreenerSortKey) => {
      if (next === sort) {
        setDirection((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }
      setSort(next);
      setDirection(next === "name" || next === "trailingPE" || next === "distanceFromHigh" ? "asc" : "desc");
    }
  };
}
