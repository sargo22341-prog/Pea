import type { EditablePortfolioTransaction, PositionWithMarket } from "@pea/shared";
import { Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

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
  const [rows, setRows] = useState<EditablePortfolioTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.positionTransactions(position.id)
      .then((transactions) => {
        if (alive) setRows(transactions);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Chargement impossible."))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [position.id]);

  function patchRow(index: number, patch: Partial<EditablePortfolioTransaction>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function save(row: EditablePortfolioTransaction) {
    if (row.id.startsWith("legacy-")) {
      setError("Cette ligne legacy vient de la position CSV. Ajoute une transaction datee pour l'editer finement.");
      return;
    }
    setError(null);
    const nextRows = await api.updatePositionTransaction(position.id, row.id, {
      tradedAt: row.tradedAt,
      quantity: row.quantity,
      price: row.price,
      fees: row.totalFees ?? row.fees ?? 0,
      currency: row.currency
    });
    setRows(nextRows);
    onSaved();
  }

  async function remove(row: EditablePortfolioTransaction) {
    if (row.id.startsWith("legacy-")) return;
    if (!window.confirm("Supprimer cette transaction ?")) return;
    await api.deletePositionTransaction(position.id, row.id);
    setRows((current) => current.filter((item) => item.id !== row.id));
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:items-center sm:justify-center">
      <div className="card max-h-[90vh] w-full max-w-5xl overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 className="text-lg font-semibold">Transactions {position.symbol}</h2>
            <p className="muted">Modifier les transactions qui alimentent la quantite, le PRU et les frais.</p>
          </div>
          <button className="btn-ghost" onClick={onClose} type="button">Fermer</button>
        </div>

        {loading ? <p className="p-4 text-slate-400">Chargement...</p> : null}
        {error ? <p className="m-4 rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}

        <div className="max-h-[58vh] overflow-y-auto p-4">
          <div className="space-y-3">
            {rows.map((row, index) => (
              <div className="rounded-md border border-line bg-ink/60 p-3" key={row.id}>
                <div className="grid gap-3 md:grid-cols-[minmax(190px,1.5fr)_1fr_1fr_1fr_110px_auto_auto] md:items-end">
                  <label>
                    <span className="muted mb-1 block">Date</span>
                    <input className="input" onChange={(event) => patchRow(index, { tradedAt: event.target.value, dateExecution: event.target.value })} value={row.tradedAt ?? ""} />
                  </label>
                  <label>
                    <span className="muted mb-1 block">Quantite</span>
                    <input className="input" min="0" onChange={(event) => patchRow(index, { quantity: Number(event.target.value) })} step="any" type="number" value={row.quantity} />
                  </label>
                  <label>
                    <span className="muted mb-1 block">Prix</span>
                    <input className="input" min="0" onChange={(event) => patchRow(index, { price: Number(event.target.value), executedPrice: Number(event.target.value) })} step="any" type="number" value={row.price} />
                  </label>
                  <label>
                    <span className="muted mb-1 block">Frais</span>
                    <input className="input" min="0" onChange={(event) => patchRow(index, { totalFees: Number(event.target.value), fees: Number(event.target.value) })} step="any" type="number" value={row.totalFees ?? row.fees ?? 0} />
                  </label>
                  <label>
                    <span className="muted mb-1 block">Devise</span>
                    <input className="input" onChange={(event) => patchRow(index, { currency: event.target.value.toUpperCase() })} value={row.currency} />
                  </label>
                  <button className="btn-primary" disabled={row.id.startsWith("legacy-")} onClick={() => void save(row)} type="button">
                    <Save size={16} />
                    Sauver
                  </button>
                  <button className="btn-ghost text-coral" disabled={row.id.startsWith("legacy-")} onClick={() => void remove(row)} type="button">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between gap-3 border-t border-line p-4">
          <button className="btn-ghost text-coral" onClick={onDeleted} type="button">
            <Trash2 size={17} />
            Supprimer l'action
          </button>
          <button className="btn-primary" onClick={onClose} type="button">Terminer</button>
        </div>
      </div>
    </div>
  );
}
