import type { EnrichedSearchResult } from "@pea/shared";
import { Search, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MiniChart } from "../components/MiniChart";
import { PeaBadge } from "../components/PeaBadge";
import { StaleBadge } from "../components/StaleBadge";
import { api } from "../lib/api";
import { money, percent } from "../lib/format";

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EnrichedSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        setResults(await api.enrichedSearch(query));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Recherche impossible");
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timeout);
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
        <p className="muted">Recherchez des actions ou ETF et ajoutez-les à votre liste de suivi.</p>
      </div>

      <label className="relative block">
        <Search className="absolute left-3 top-3 text-slate-500" size={18} />
        <input className="input pl-10" onChange={(event) => setQuery(event.target.value)} placeholder="Ticker, entreprise ou ETF" value={query} />
      </label>

      {error && <div className="card border-coral p-4 text-coral">{error}</div>}
      {loading && <div className="card p-4 text-slate-400">Recherche en cours...</div>}

      <div className="card divide-y divide-line overflow-hidden">
        {results.map((item) => (
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 p-4" key={`${item.symbol}-${item.exchange}`}>
            <Link className="min-w-0" to={`/assets/${item.symbol}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold">{item.name}</p>
                <PeaBadge status={item.peaEligibility.status} />
                <StaleBadge show={item.marketDataUnavailable || item.stale} />
              </div>
              <p className="muted">
                {item.symbol} {item.isInPortfolio ? "· En portefeuille" : ""}
              </p>
            </Link>
            <div className="hidden text-right sm:block">
              <p className="font-semibold">{item.price === undefined ? "n/a" : money(item.price, item.currency ?? "EUR")}</p>
              <p className={(item.regularMarketChangePercent ?? 0) >= 0 ? "text-sm text-mint" : "text-sm text-coral"}>
                {item.regularMarketChangePercent === undefined ? "n/a" : percent(item.regularMarketChangePercent)}
              </p>
            </div>
            <MiniChart data={item.history} />
            <button className="text-amber" onClick={() => void toggle(item)} title="Liste de suivi" type="button">
              <Star fill={item.isInWatchlist ? "currentColor" : "none"} size={22} />
            </button>
          </div>
        ))}
        {!loading && query.length >= 2 && results.length === 0 && <p className="p-4 text-slate-400">Aucun résultat.</p>}
      </div>
    </div>
  );
}
