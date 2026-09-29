import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { parseCompareSymbols } from "../compare-symbols";

/** Sélection du comparateur, portée par l'URL (partageable, conservée au rechargement). */
export function useCompareSelection() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("symbols");
  const { symbols, issue } = useMemo(() => parseCompareSymbols(raw), [raw]);

  function write(next: string[]) {
    setParams(next.length ? { symbols: next.join(",") } : {}, { replace: true });
  }

  return {
    symbols,
    issue,
    add: (symbol: string) => { write([...symbols.filter((known) => known !== symbol.toUpperCase()), symbol.toUpperCase()]); },
    remove: (symbol: string) => { write(symbols.filter((known) => known !== symbol)); }
  };
}
