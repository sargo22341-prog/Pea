import type { BoursoramaImportRow, BoursoramaUpdateRow } from "@pea/shared";
import { Database, Upload } from "lucide-react";
import { useCsvImport } from "../hooks/useCsvImport";

function hasFieldError(errors: string[], field: "symbol" | "quantity" | "price" | "general") {
  const text = errors.join(" ").toLowerCase();
  if (field === "symbol") return /ticker|symbole|actif|yahoo|isin/.test(text);
  if (field === "quantity") return /quantit|qte/.test(text);
  if (field === "price") return /prix|pru|cours/.test(text);
  return errors.length > 0;
}

function inputTone(hasError: boolean) {
  return `input ${hasError ? "border-coral bg-coral/10 focus:border-coral" : ""}`;
}

function detectedAssetLabel(row: BoursoramaImportRow | BoursoramaUpdateRow) {
  if (row.detectedAsset) {
    return `Actif detecte : ${row.detectedAsset.symbol} - ${row.detectedAsset.name} ${Math.round(row.detectedAsset.confidenceScore * 100)}%`;
  }
  if (row.symbol) return `Actif detecte : ${row.symbol}`;
  return "Actif detecte : a renseigner";
}

export function CsvImportSection() {
  const csvImport = useCsvImport();

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Import CSV Boursorama</h2>
          <p className="muted">Importer ou synchroniser l'etat total du portefeuille.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="btn-ghost cursor-pointer">
            <Upload size={17} />
            Importer CSV
            <input accept=".csv,text/csv" className="hidden" onChange={(event) => void csvImport.importCsv(event.target.files?.[0])} type="file" />
          </label>
          <label className="btn-ghost cursor-pointer">
            <Upload size={17} />
            Mettre a jour via CSV
            <input accept=".csv,text/csv" className="hidden" onChange={(event) => void csvImport.previewUpdate(event.target.files?.[0])} type="file" />
          </label>
        </div>
      </div>
      {csvImport.message && <p className="p-4 text-sm text-mint">{csvImport.message}</p>}
      {csvImport.loading && <p className="p-4 text-slate-400">Traitement...</p>}
      {csvImport.rows.length > 0 && (
        <ImportPreviewTable
          loading={csvImport.loading}
          onConfirm={() => void csvImport.confirmImport()}
          onUpdateRow={csvImport.updateImportRow}
          rows={csvImport.rows}
        />
      )}
      {csvImport.updateRows.length > 0 && (
        <UpdatePreviewTable
          loading={csvImport.loading}
          onConfirm={() => void csvImport.confirmUpdate()}
          onShowUnchangedChange={csvImport.setShowUnchanged}
          onUpdateRow={csvImport.updateSyncRow}
          rows={csvImport.visibleUpdateRows}
          showUnchanged={csvImport.showUnchanged}
        />
      )}
    </section>
  );
}

function ImportPreviewTable({
  loading,
  onConfirm,
  onUpdateRow,
  rows
}: {
  loading: boolean;
  onConfirm: () => void;
  onUpdateRow: (index: number, patch: Partial<BoursoramaImportRow>) => void;
  rows: BoursoramaImportRow[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-ink text-left text-slate-400">
          <tr>
            <th className="p-3">Nom</th>
            <th className="p-3">ISIN</th>
            <th className="p-3">Qte</th>
            <th className="p-3">PRU</th>
            <th className="p-3">Ticker</th>
            <th className="p-3">Action</th>
            <th className="p-3">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, index) => (
            <tr className={row.errors.length ? "bg-coral/5" : ""} key={`${row.line}-${row.isin}`}>
              <td className="p-3">{row.name}</td>
              <td className="p-3">{row.isin}</td>
              <td className={`p-3 ${hasFieldError(row.errors, "quantity") ? "text-coral" : ""}`}>{row.quantity}</td>
              <td className={`p-3 ${hasFieldError(row.errors, "price") ? "text-coral" : ""}`}>{row.buyingPrice}</td>
              <td className="p-3">
                <input className={inputTone(hasFieldError(row.errors, "symbol"))} onChange={(event) => onUpdateRow(index, { symbol: event.target.value.toUpperCase(), needsReview: false, errors: [] })} value={row.symbol ?? ""} />
                <p className="mt-1 text-xs text-slate-400">{detectedAssetLabel(row)}</p>
              </td>
              <td className="p-3">
                <select className="input" onChange={(event) => onUpdateRow(index, { action: event.target.value as BoursoramaImportRow["action"] })} value={row.action ?? "merge"}>
                  <option value="merge">Fusionner</option>
                  <option value="replace">Remplacer</option>
                  <option value="ignore">Ignorer</option>
                </select>
              </td>
              <td className={`p-3 ${row.errors.length ? "text-coral" : row.needsReview ? "text-amber" : "text-mint"}`}>{row.errors.length ? row.errors.join(", ") : row.needsReview ? "A verifier" : "OK"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end p-4">
        <button className="btn-primary" disabled={loading} onClick={onConfirm} type="button">
          <Database size={17} />
          Importer
        </button>
      </div>
    </div>
  );
}

function UpdatePreviewTable({
  loading,
  onConfirm,
  onShowUnchangedChange,
  onUpdateRow,
  rows,
  showUnchanged
}: {
  loading: boolean;
  onConfirm: () => void;
  onShowUnchangedChange: (show: boolean) => void;
  onUpdateRow: (row: BoursoramaUpdateRow, patch: Partial<BoursoramaUpdateRow>) => void;
  rows: BoursoramaUpdateRow[];
  showUnchanged: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <label className="flex items-center gap-2 p-4 text-sm text-slate-400">
        <input checked={showUnchanged} onChange={(event) => onShowUnchangedChange(event.target.checked)} type="checkbox" />
        Afficher les lignes inchangees
      </label>
      <table className="w-full min-w-[1120px] text-sm">
        <thead className="bg-ink text-left text-slate-400">
          <tr>
            <th className="p-3">Nom</th>
            <th className="p-3">ISIN</th>
            <th className="p-3">Ticker</th>
            <th className="p-3">Qte app</th>
            <th className="p-3">Qte CSV</th>
            <th className="p-3">Diff</th>
            <th className="p-3">PRU app</th>
            <th className="p-3">PRU CSV</th>
            <th className="p-3">Diff PRU</th>
            <th className="p-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, index) => {
            const averageBuyPriceDiff = row.csvAverageBuyPrice - (row.currentAverageBuyPrice ?? row.csvAverageBuyPrice);
            const averageBuyPriceChanged = Math.abs(averageBuyPriceDiff) >= 0.000001 && row.proposedAction !== "delete";

            return (
              <tr className={row.errors.length ? "bg-coral/5" : ""} key={`${row.symbol}-${row.line}-${index}`}>
                <td className="p-3">{row.name}</td>
                <td className="p-3">{row.isin || "n/a"}</td>
                <td className="p-3">
                  <input className={inputTone(hasFieldError(row.errors, "symbol"))} onChange={(event) => onUpdateRow(row, { symbol: event.target.value.toUpperCase(), errors: [] })} value={row.symbol ?? ""} />
                  <p className="mt-1 text-xs text-slate-400">{detectedAssetLabel(row)}</p>
                </td>
                <td className="p-3">{row.currentQuantity ?? 0}</td>
                <td className={`p-3 ${hasFieldError(row.errors, "quantity") ? "text-coral" : ""}`}>{row.csvQuantity}</td>
                <td className={`p-3 ${row.quantityDiff >= 0 ? "text-mint" : "text-coral"}`}>{row.quantityDiff}</td>
                <td className="p-3">{row.currentAverageBuyPrice ?? "n/a"}</td>
                <td className={`p-3 ${hasFieldError(row.errors, "price") ? "text-coral" : ""}`}>{row.csvAverageBuyPrice}</td>
                <td className={`p-3 ${averageBuyPriceDiff >= 0 ? "text-mint" : "text-coral"}`}>
                  {averageBuyPriceChanged ? averageBuyPriceDiff.toLocaleString("fr-FR", { maximumFractionDigits: 4 }) : "0"}
                  {averageBuyPriceChanged && (
                    <span className="ml-2 rounded bg-mint/10 px-2 py-1 text-[11px] font-semibold text-mint">
                      PRU mis a jour
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <p>{row.proposedAction}</p>
                  {row.errors.length ? <p className="mt-1 text-xs text-coral">{row.errors.join(", ")}</p> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex justify-end p-4">
        <button className="btn-primary" disabled={loading} onClick={onConfirm} type="button">
          <Database size={17} />
          Valider la mise a jour
        </button>
      </div>
    </div>
  );
}
