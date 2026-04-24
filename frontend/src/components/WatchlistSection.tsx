import { Star } from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { money, percent } from "../lib/format";
import { AssetIcon } from "./AssetIcon";
import { MiniChart } from "./MiniChart";
import { StaleBadge } from "./StaleBadge";

export function WatchlistSection() {
  const watchlist = useAsync(() => api.watchlist(), []);

  if (watchlist.loading) return <div className="card p-4 text-slate-400">Chargement de la liste de suivi...</div>;
  if (!watchlist.data || watchlist.data.length === 0) return null;

  async function remove(symbol: string) {
    await api.removeWatchlist(symbol);
    await watchlist.reload();
  }

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line p-4">
        <h2 className="font-semibold">Liste de suivi</h2>
      </div>
      <div className="divide-y divide-line">
        {watchlist.data.map((item) => (
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 p-4" key={item.symbol}>
            <Link className="flex min-w-0 items-center gap-3" to={`/assets/${item.symbol}`}>
              <AssetIcon symbol={item.symbol} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold">{item.name}</p>
                  <StaleBadge show={item.marketDataUnavailable || item.quote?.stale} />
                </div>
                <p className="muted">{item.symbol}</p>
              </div>
            </Link>
            <div className="hidden text-right sm:block">
              <p className="font-semibold">{item.quote ? money(item.quote.price, item.quote.currency) : "n/a"}</p>
              <p className={(item.quote?.change ?? 0) >= 0 ? "text-sm text-mint" : "text-sm text-coral"}>
                {item.quote?.changePercent === undefined ? "n/a" : percent(item.quote.changePercent)}
              </p>
            </div>
            <MiniChart data={item.history} />
            <button className="text-amber" onClick={() => void remove(item.symbol)} title="Retirer de la liste de suivi" type="button">
              <Star fill="currentColor" size={20} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
