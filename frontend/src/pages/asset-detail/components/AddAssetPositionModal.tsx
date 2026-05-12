/**
 * Role du fichier : afficher le formulaire modal d'ajout manuel d'une position
 * depuis la page detail d'un actif.
 */

import { Plus } from "lucide-react";
import { useAddAssetPositionForm } from "../hooks/useAssetPositionModalForm";

export function AddAssetPositionModal({
  symbol,
  name,
  currency,
  onClose,
  onSaved
}: {
  symbol: string;
  name: string;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useAddAssetPositionForm({ symbol, name, currency, onSaved });

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:items-center sm:justify-center">
      <form className="card w-full max-w-md space-y-4 p-4" onSubmit={form.submit}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Ajouter {symbol}</h2>
          <button className="btn-ghost" onClick={onClose} type="button">Fermer</button>
        </div>
        <label className="block">
          <span className="muted mb-1 block">Quantite</span>
          <input className="input" min="0" onChange={(event) => form.setQuantity(event.target.value)} required step="any" type="number" value={form.quantity} />
        </label>
        <label className="block">
          <span className="muted mb-1 block">Prix d'achat moyen</span>
          <input className="input" min="0" onChange={(event) => form.setAverageBuyPrice(event.target.value)} required step="any" type="number" value={form.averageBuyPrice} />
        </label>
        {form.error && <p className="rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{form.error}</p>}
        <button className="btn-primary w-full" disabled={form.saving} type="submit">
          <Plus size={17} />
          {form.saving ? "Ajout..." : "Ajouter"}
        </button>
      </form>
    </div>
  );
}
