import type { EnrichedSearchResult } from "@pea/shared";
import { Plus, Search } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { money } from "../lib/format";

export function AddPositionForm({ onCreated, compact = false }: { onCreated: () => void; compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EnrichedSearchResult[]>([]);
  const [selected, setSelected] = useState<EnrichedSearchResult | null>(null);
  const [quantity, setQuantity] = useState("");
  const [averageBuyPrice, setAverageBuyPrice] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastQueryRef = useRef("");

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setResults([]);
      setSearching(false);
      lastQueryRef.current = "";
      return;
    }

    if (normalizedQuery === lastQueryRef.current) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const nextResults = await api.enrichedSearch(normalizedQuery, controller.signal);
        lastQueryRef.current = normalizedQuery;
        setResults(nextResults);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Recherche impossible");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 800);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const symbol = selected?.symbol ?? query.trim().toUpperCase();
    const parsedQuantity = Number(quantity);
    const parsedAverageBuyPrice = Number(averageBuyPrice);

    if (!symbol) {
      setError("Choisissez un ticker.");
      return;
    }

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError("La quantité doit être supérieure à 0.");
      return;
    }

    if (!Number.isFinite(parsedAverageBuyPrice) || parsedAverageBuyPrice < 0) {
      setError("Le prix d’achat moyen doit être positif ou égal à 0.");
      return;
    }

    setLoading(true);
    try {
      await api.addPosition({
        symbol,
        name: selected?.name,
        quantity: parsedQuantity,
        averageBuyPrice: parsedAverageBuyPrice,
        currency,
        purchaseDate: purchaseDate || undefined
      });
      setQuery("");
      setResults([]);
      setSelected(null);
      setQuantity("");
      setAverageBuyPrice("");
      setPurchaseDate("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ajout impossible");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={`card space-y-3 p-4 ${compact ? "lg:sticky lg:top-24" : ""}`} onSubmit={submit}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Ajouter une position</h2>
        <Plus className="text-mint" size={20} />
      </div>

      <label className="block">
        <span className="muted mb-1 block">Ticker, entreprise ou ETF</span>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={18} />
          <input
            className="input pl-10"
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
            }}
            placeholder="Ex: total, TTE.PA, amundi pea, msci world"
            value={selected ? `${selected.symbol} - ${selected.name}` : query}
          />
        </div>
      </label>

      {searching && !selected && <div className="rounded-md border border-line bg-ink p-3 text-sm text-slate-400">Recherche...</div>}

      {results.length > 0 && !selected && (
        <div className="max-h-72 overflow-y-auto rounded-md border border-line bg-ink">
          {results.map((result) => (
            <button
              className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-panel2"
              key={`${result.symbol}-${result.exchange}`}
              onClick={() => {
                setSelected(result);
                setCurrency(result.currency ?? "EUR");
              }}
              type="button"
            >
              <span>
                <span className="block font-semibold">{result.symbol}</span>
                <span className="text-xs text-slate-400">{result.name}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  {result.price === undefined ? "Prix n/a" : money(result.price, result.currency ?? "EUR")}
                </span>
              </span>
              {result.isInPortfolio && <span className="rounded bg-mint/10 px-2 py-1 text-[11px] font-semibold text-mint">En portefeuille</span>}
            </button>
          ))}
        </div>
      )}

      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
        <label>
          <span className="muted mb-1 block">Quantité</span>
          <input className="input" min="0" onChange={(event) => setQuantity(event.target.value)} required step="any" type="number" value={quantity} />
        </label>
        <label>
          <span className="muted mb-1 block">Prix d’achat moyen</span>
          <input
            className="input"
            min="0"
            onChange={(event) => setAverageBuyPrice(event.target.value)}
            required
            step="any"
            type="number"
            value={averageBuyPrice}
          />
        </label>
        <label>
          <span className="muted mb-1 block">Devise</span>
          <select className="input" onChange={(event) => setCurrency(event.target.value)} value={currency}>
            <option>EUR</option>
            <option>USD</option>
            <option>GBP</option>
            <option>CHF</option>
          </select>
        </label>
        <label>
          <span className="muted mb-1 block">Date d’achat</span>
          <input className="input" onChange={(event) => setPurchaseDate(event.target.value)} type="date" value={purchaseDate} />
        </label>
      </div>

      {error && <p className="rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{error}</p>}

      <button className="btn-primary w-full" disabled={loading} type="submit">
        <Plus size={18} />
        {loading ? "Ajout en cours" : "Ajouter la position"}
      </button>
    </form>
  );
}
