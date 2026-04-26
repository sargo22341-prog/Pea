import type { PositionWithMarket } from "@pea/shared";
import { Trash2 } from "lucide-react";
import { useEditPositionForm } from "../hooks/useAssetPositionModalForm";

export function EditPositionModal({
  position,
  onClose,
  onSaved,
  onDeleted
}: {
  position: PositionWithMarket;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const form = useEditPositionForm({ position, onClose, onSaved });

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:items-center sm:justify-center">
      <form className="card w-full max-w-lg space-y-4 p-4" onSubmit={form.submit}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Ã‰diter {position.symbol}</h2>
          <button className="btn-ghost" onClick={onClose} type="button">Fermer</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="muted mb-1 block">QuantitÃ©</span>
            <input className="input" min="0" onChange={(event) => form.setQuantity(event.target.value)} required step="any" type="number" value={form.quantity} />
          </label>
          <label>
            <span className="muted mb-1 block">Prix dâ€™achat moyen</span>
            <input className="input" min="0" onChange={(event) => form.setAverageBuyPrice(event.target.value)} required step="any" type="number" value={form.averageBuyPrice} />
          </label>
          <label>
            <span className="muted mb-1 block">Devise</span>
            <select className="input" onChange={(event) => form.setCurrency(event.target.value)} value={form.currency}>
              <option>EUR</option>
              <option>USD</option>
              <option>GBP</option>
              <option>CHF</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="muted mb-1 block">Notes</span>
          <textarea className="input min-h-24" onChange={(event) => form.setNotes(event.target.value)} value={form.notes} />
        </label>

        {form.error && <p className="rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{form.error}</p>}

        <div className="rounded-md border border-coral/40 bg-coral/10 p-3">
          <p className="mb-3 text-sm font-semibold text-coral">Zone danger</p>
          <button className="btn-ghost text-coral" onClick={onDeleted} type="button">
            <Trash2 size={17} />
            Supprimer lâ€™action
          </button>
        </div>

        <button className="btn-primary w-full" disabled={form.saving} type="submit">
          {form.saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
