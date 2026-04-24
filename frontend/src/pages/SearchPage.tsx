import type { EnrichedSearchResult } from "@pea/shared";
import { Search, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { money, percent } from "../lib/format";

export function SearchPage() {
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
    }, 800);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  async function toggle(item: EnrichedSearchResult) {
    if (item.isInWatchlist) {
      await api.removeWatchlist(item.symbol);
    } else {
      await api.addWatchlist(item);
    }
    setResults((current) =>
      current.map((row) => (row.symbol === item.symbol ? { ...row, isInWatchlist: !row.isInWatchlist } : row))
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Chercher</h1>
        <p className="muted">Recherchez des actions ou ETF et ajoutez-les a votre liste de suivi.</p>
      </div>

      <label className="relative block">
        <Search className="absolute left-3 top-3 text-slate-500" size={18} />
        <input className="input pl-10" onChange={(event) => setQuery(event.target.value)} placeholder="Ticker, entreprise ou ETF" value={query} />
      </label>

      {error && <div className="card border-coral p-4 text-coral">{error}</div>}
      {loading && <SearchSkeleton />}

      <div className="card divide-y divide-line overflow-hidden">
        {results.map((item) => (
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 p-4" key={`${item.symbol}-${item.exchange}`}>
            <Link className="min-w-0" to={`/assets/${item.symbol}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold">{item.name}</p>
                {item.isInPortfolio && <span className="rounded bg-mint/10 px-2 py-1 text-[11px] font-semibold text-mint">En portefeuille</span>}
              </div>
              <p className="muted">{item.symbol}</p>
            </Link>
            <div className="hidden text-right sm:block">
              <p className="font-semibold">{item.price === undefined ? "n/a" : money(item.price, item.currency ?? "EUR")}</p>
              <p className={(item.regularMarketChangePercent ?? 0) >= 0 ? "text-sm text-mint" : "text-sm text-coral"}>
                {item.regularMarketChangePercent === undefined ? "n/a" : percent(item.regularMarketChangePercent)}
              </p>
            </div>
            <button className="text-amber" onClick={() => void toggle(item)} title="Liste de suivi" type="button">
              <Star fill={item.isInWatchlist ? "currentColor" : "none"} size={22} />
            </button>
          </div>
        ))}
        {!loading && query.trim().length >= 2 && results.length === 0 && <p className="p-4 text-slate-400">Aucun resultat.</p>}
      </div>
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="card divide-y divide-line overflow-hidden">
      {[0, 1, 2].map((item) => (
        <div className="grid grid-cols-[1fr_auto] gap-3 p-4" key={item}>
          <div className="space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-panel2" />
            <div className="h-3 w-24 animate-pulse rounded bg-panel2" />
          </div>
          <div className="h-8 w-16 animate-pulse rounded bg-panel2" />
        </div>
      ))}
    </div>
  );
}
