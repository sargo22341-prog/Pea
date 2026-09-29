import { useEffect, useState } from "react";

/** Valeur recopiée après `delayMs` sans changement (saisie de filtres, recherche). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => { setDebounced(value); }, delayMs);
    return () => { window.clearTimeout(timer); };
  }, [value, delayMs]);
  return debounced;
}
