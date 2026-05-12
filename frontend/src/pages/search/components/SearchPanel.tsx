/**
 * Role du fichier : afficher le formulaire de recherche d'actifs et la liste de
 * resultats enrichis avec l'etat portefeuille/liste de suivi.
 */

import type { EnrichedSearchResult } from "@pea/shared";
import { Search, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { money, percent } from "../../../lib/format";

/** Panneau autonome de recherche d'actifs utilise par la page /search. */
export function SearchPanel({
  error,
  localPeaSearchEnabled,
  loading,
  onQueryChange,
  onToggleWatchlist,
  query,
  results
}: {
  error: string | null;
  localPeaSearchEnabled?: boolean;
  loading: boolean;
  onQueryChange: (query: string) => void;
  onToggleWatchlist: (item: EnrichedSearchResult) => void;
  query: string;
  results: EnrichedSearchResult[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Chercher</h1>
        <p className="muted">Recherchez des actions ou ETF et ajoutez-les a votre liste de suivi.</p>
      </div>

      <label className="relative block">
        <Search className="absolute left-3 top-3 text-slate-500" size={18} />
        <input className="input pl-10" onChange={(event) => onQueryChange(event.target.value)} placeholder="Ticker, entreprise ou ETF" value={query} />
      </label>

      {error && <div className="card border-coral p-4 text-coral">{error}</div>}
      {loading && <SearchSkeleton />}

      <div className="card divide-y divide-line overflow-hidden">
        {results.map((item) => (
          <SearchResultRow item={item} key={`${item.symbol}-${item.exchange}`} onToggleWatchlist={onToggleWatchlist} />
        ))}
        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <p className="p-4 text-slate-400">
            {localPeaSearchEnabled ? "Aucun resultat dans la liste locale PEA." : "Aucun resultat."}
          </p>
        )}
      </div>
    </div>
  );
}

/** Ligne de resultat de recherche avec acces au detail et bascule liste de suivi. */
function SearchResultRow({
  item,
  onToggleWatchlist
}: {
  item: EnrichedSearchResult;
  onToggleWatchlist: (item: EnrichedSearchResult) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 p-4">
      <Link className="min-w-0" to={`/assets/${item.symbol}`}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold">{item.name}</p>
          {item.isInPortfolio && <span className="rounded bg-mint/10 px-2 py-1 text-[11px] font-semibold text-mint">En portefeuille</span>}
        </div>
        <p className="muted">{item.symbol}</p>
        {item.quoteType && <p className="text-xs text-slate-500">{item.quoteType}</p>}
      </Link>
      <div className="hidden text-right sm:block">
        <p className="font-semibold">{item.price === undefined ? "n/a" : money(item.price, item.currency ?? "EUR")}</p>
        <p className={(item.regularMarketChangePercent ?? 0) >= 0 ? "text-sm text-mint" : "text-sm text-coral"}>
          {item.regularMarketChangePercent === undefined ? "n/a" : percent(item.regularMarketChangePercent)}
        </p>
      </div>
      <button className="text-amber" onClick={() => onToggleWatchlist(item)} title="Liste de suivi" type="button">
        <Star fill={item.isInWatchlist ? "currentColor" : "none"} size={22} />
      </button>
    </div>
  );
}

/** Squelette affiche pendant l'appel de recherche enrichie. */
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
