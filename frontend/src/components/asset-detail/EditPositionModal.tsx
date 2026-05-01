/**
 * Role du fichier : afficher et modifier les transactions rattachees a une position.
 */

import type { EditablePortfolioTransaction, PositionWithMarket } from "@pea/shared";
import { Plus, Save, Trash2 } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { currentDateTimeLocalValue, toDateTimeLocalValue } from "../../lib/dateTimeInput";
import { api } from "../../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";

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
  const [pendingDelete, setPendingDelete] = useState<EditablePortfolioTransaction | null>(null);
  const [confirmPositionDelete, setConfirmPositionDelete] = useState(false);

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

  function addDraftTransaction() {
    const now = currentDateTimeLocalValue();
    setRows((current) => [
      {
        id: `draft-${Date.now()}`,
        positionId: position.id,
        assetId: String(position.id),
        source: "manual",
        dateExecution: now,
        tradedAt: now,
        assetName: position.name,
        ticker: position.symbol,
        type: "buy",
        quantity: 0,
        executedPrice: 0,
        price: 0,
        totalFees: 0,
        currency: position.currency,
        createdAt: now
      },
      ...current.filter((row) => !row.id.startsWith("legacy-"))
    ]);
  }

  async function save(row: EditablePortfolioTransaction) {
    if (row.id.startsWith("legacy-")) {
      setError("Cette ligne legacy vient de la position CSV. Ajoute une transaction datee pour l'editer finement.");
      return;
    }
    setError(null);
    const payload = {
      tradedAt: row.tradedAt,
      type: row.type === "sell" ? "sell" : "buy",
      quantity: row.quantity,
      price: row.price,
      totalFees: row.totalFees ?? 0,
      currency: row.currency
    } as const;
    const nextRows = row.id.startsWith("draft-")
      ? await api.createPositionTransaction(position.id, payload)
      : await api.updatePositionTransaction(position.id, row.id, payload);
    setRows(nextRows);
    onSaved();
  }

  async function remove(row: EditablePortfolioTransaction) {
    if (row.id.startsWith("legacy-")) return setPendingDelete(null);
    if (row.id.startsWith("draft-")) {
      setRows((current) => current.filter((item) => item.id !== row.id));
      setPendingDelete(null);
      return;
    }
    await api.deletePositionTransaction(position.id, row.id);
    setRows((current) => current.filter((item) => item.id !== row.id));
    setPendingDelete(null);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:items-center sm:justify-center">
      <div className="card max-h-[90vh] w-full max-w-5xl overflow-hidden p-0 bg-ink/85">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Transactions {position.symbol}</h2>
            <p className="muted">Modifier les transactions qui alimentent la quantite, le PRU et les frais.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button className="btn-primary" onClick={addDraftTransaction} type="button">
              <Plus size={17} />
              Ajouter une transaction
            </button>
            <button className="btn-ghost" onClick={onClose} type="button">Fermer</button>
          </div>
        </div>

        {loading ? <p className="p-4 text-slate-400">Chargement...</p> : null}
        {error ? <p className="m-4 rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}

        <div className="max-h-[58vh] overflow-y-auto p-4">
          <div className="space-y-3">
            {rows.map((row, index) => {
              const isDraft = row.id.startsWith("draft-");
              const separatesExistingRows = index > 0 && !isDraft && rows[index - 1]?.id.startsWith("draft-");

              return (
                <Fragment key={row.id}>
                  {separatesExistingRows ? (
                    <div className="flex items-center gap-3 py-1 text-xs font-medium uppercase text-slate-500">
                      <span className="h-px flex-1 bg-line" />
                      <span>Transactions existantes</span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  ) : null}
                  <div className={`rounded-md border p-3 ${isDraft ? "border-mint/50 bg-mint/5" : "border-line bg-ink/60"}`}>
                    {isDraft ? <p className="mb-3 text-xs font-medium uppercase text-mint">A remplir</p> : null}
                    <div className="grid gap-3 md:grid-cols-[minmax(190px,1.5fr)_120px_1fr_1fr_1fr_110px_auto_auto] md:items-end">
                      <label>
                        <span className="muted mb-1 block">Date</span>
                        <input className="input" onChange={(event) => patchRow(index, { tradedAt: event.target.value, dateExecution: event.target.value })} type="datetime-local" value={toDateTimeLocalValue(row.tradedAt)} />
                      </label>
                      <label>
                        <span className="muted mb-1 block">Sens</span>
                        <select className="input" onChange={(event) => patchRow(index, { type: event.target.value as EditablePortfolioTransaction["type"] })} value={row.type}>
                          <option value="buy">Achat</option>
                          <option value="sell">Vente</option>
                        </select>
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
                        <input className="input" min="0" onChange={(event) => patchRow(index, { totalFees: Number(event.target.value) })} step="any" type="number" value={row.totalFees ?? 0} />
                      </label>
                      <label>
                        <span className="muted mb-1 block">Devise</span>
                        <input className="input" onChange={(event) => patchRow(index, { currency: event.target.value.toUpperCase() })} value={row.currency} />
                      </label>
                      <button className="btn-primary" disabled={row.id.startsWith("legacy-")} onClick={() => void save(row)} type="button">
                        <Save size={16} />
                        Sauver
                      </button>
                      <button className="btn-ghost text-coral" disabled={row.id.startsWith("legacy-")} onClick={() => setPendingDelete(row)} type="button">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </Fragment>
              );
            })}
            {!rows.length && !loading ? (
              <div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-slate-400">
                Aucune transaction pour cette position.
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex justify-between gap-3 border-t border-line p-4">
          <button className="btn-ghost text-coral" onClick={() => setConfirmPositionDelete(true)} type="button">
            <Trash2 size={17} />
            Supprimer l'action
          </button>
          <button className="btn-primary" onClick={onClose} type="button">Terminer</button>
        </div>
      </div>
      {pendingDelete ? (
        <ConfirmDialog
          danger
          confirmLabel="Supprimer"
          description={`La transaction ${pendingDelete.type === "sell" ? "de vente" : "d'achat"} du ${toDateTimeLocalValue(pendingDelete.tradedAt).replace("T", " ")} sera supprimee.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void remove(pendingDelete)}
          title="Supprimer cette transaction ?"
        />
      ) : null}
      {confirmPositionDelete ? (
        <ConfirmDialog
          danger
          confirmLabel="Supprimer la position"
          description={`La position ${position.symbol} et ses transactions seront supprimees du portefeuille.`}
          onCancel={() => setConfirmPositionDelete(false)}
          onConfirm={onDeleted}
          title={`Supprimer ${position.symbol} ?`}
        />
      ) : null}
    </div>
  );
}
