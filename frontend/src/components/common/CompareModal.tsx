import { Search, X } from "lucide-react";
import { useEnrichedSearch } from "../../hooks/useEnrichedSearch";

export const COMPARE_COLORS = ["#3b82f6", "#f59e0b", "#8b5cf6", "#10b981"] as const;

interface SelectedAsset {
  symbol: string;
  name: string;
}

interface CompareModalProps {
  currentSymbol: string;
  selected: SelectedAsset[];
  onAdd: (asset: SelectedAsset) => void;
  onRemove: (symbol: string) => void;
  onClose: () => void;
  localPeaSearchEnabled?: boolean;
}

const MAX_COMPARE = 4;

export function CompareModal({ currentSymbol, selected, onAdd, onRemove, onClose, localPeaSearchEnabled }: CompareModalProps) {
  const { query, setQuery, results, loading } = useEnrichedSearch({ localPeaSearchEnabled });
  const excluded = new Set([currentSymbol, ...selected.map((s) => s.symbol)]);
  const canAdd = selected.length < MAX_COMPARE;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:items-center sm:justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card w-full max-w-md space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Comparer avec</h2>
          <button className="btn-ghost" onClick={onClose} type="button">
            <X size={17} />
          </button>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selected.map((asset, i) => (
              <span
                key={asset.symbol}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-black"
                style={{ backgroundColor: COMPARE_COLORS[i] }}
              >
                {asset.symbol}
                <button onClick={() => onRemove(asset.symbol)} type="button">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {canAdd ? (
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              className="input pl-9"
              placeholder="Ticker, entreprise ou ETF"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        ) : (
          <p className="text-sm text-slate-400">Maximum {MAX_COMPARE} titres en comparaison.</p>
        )}

        {loading && <p className="text-sm text-slate-400">Recherche...</p>}

        {results.length > 0 && (
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {results
              .filter((r) => !excluded.has(r.symbol))
              .map((r) => (
                <button
                  key={r.symbol}
                  disabled={!canAdd}
                  onClick={() => { onAdd({ symbol: r.symbol, name: r.name }); setQuery(""); }}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  type="button"
                >
                  <span className="min-w-0 truncate text-sm">{r.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-slate-400">{r.symbol}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
