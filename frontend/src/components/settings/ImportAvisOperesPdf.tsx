import type { ParsedAvisOperation } from "@pea/shared";
import { Database, FileText, Trash2, Upload } from "lucide-react";
import { useAvisOperesPdfImport } from "../../hooks/useAvisOperesPdfImport";

export function ImportAvisOperesPdf() {
  const pdfImport = useAvisOperesPdfImport();

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Import PDF avis d'operes</h2>
          <p className="muted">Extraire, verifier puis importer des operations d'achat ou de vente.</p>
        </div>
        <label className="btn-ghost cursor-pointer">
          <Upload size={17} />
          Importer PDF
          <input accept="application/pdf,.pdf" className="hidden" multiple onChange={(event) => void pdfImport.preview(event.target.files)} type="file" />
        </label>
      </div>
      {pdfImport.message && <p className="p-4 text-sm text-mint">{pdfImport.message}</p>}
      {pdfImport.loading && <p className="p-4 text-slate-400">Extraction...</p>}
      {pdfImport.rows.length > 0 && (
        <AvisOperesPreview
          loading={pdfImport.loading}
          onConfirm={() => void pdfImport.confirm()}
          onRemoveRow={pdfImport.removeRow}
          onUpdateRow={pdfImport.updateRow}
          rows={pdfImport.rows}
        />
      )}
    </section>
  );
}

function AvisOperesPreview({
  loading,
  onConfirm,
  onRemoveRow,
  onUpdateRow,
  rows
}: {
  loading: boolean;
  onConfirm: () => void;
  onRemoveRow: (index: number) => void;
  onUpdateRow: (index: number, patch: Partial<ParsedAvisOperation>) => void;
  rows: ParsedAvisOperation[];
}) {
  return (
    <div>
      <div className="flex flex-col gap-2 p-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2">
          <FileText size={16} />
          {"Extraction -> previsualisation -> correction -> validation"}
        </span>
      </div>
      <div className="space-y-4 p-4 pt-0">
        {rows.map((row, index) => (
          <div className={`rounded-md border p-4 ${row.potentialDuplicate ? "border-amber/60 bg-amber/5" : "border-line bg-ink/40"}`} key={`${row.sourceFileName}-${index}`}>
            <div className="mb-3 text-sm text-slate-300">
              Actif detecte : {row.resolvedAsset ? `${row.resolvedAsset.name} ${Math.round(row.resolvedAsset.confidenceScore * 100)}%` : "a choisir"}
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(210px,1.1fr)_minmax(180px,0.8fr)_minmax(150px,0.7fr)]">
              <label>
                <span className="muted mb-1 block">Date execution</span>
                <input className="input" onChange={(event) => onUpdateRow(index, { dateExecution: event.target.value })} type="datetime-local" value={toDateTimeLocal(row.dateExecution)} />
              </label>
              <TextField label="Ticker" onChange={(value) => onUpdateRow(index, { selectedSymbol: value.toUpperCase() })} placeholder={row.isin ?? row.nomValeur ?? ""} value={row.selectedSymbol ?? row.ticker ?? ""} />
              <label>
                <span className="muted mb-1 block">Sens</span>
                <select className="input min-w-36" onChange={(event) => onUpdateRow(index, { sensOperation: event.target.value as ParsedAvisOperation["sensOperation"] })} value={row.sensOperation}>
                  <option value="achat">Achat</option>
                  <option value="vente">Vente</option>
                  <option value="inconnu">Inconnu</option>
                </select>
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <NumberField field="quantite" index={index} label="Quantite" onUpdateRow={onUpdateRow} row={row} />
              <NumberField field="coursExecute" index={index} label="Cours" onUpdateRow={onUpdateRow} row={row} />
              <NumberField field="montantTotalFrais" index={index} label="Total frais" onUpdateRow={onUpdateRow} row={row} />
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className={`text-sm ${row.warnings.length ? "text-amber" : "text-mint"}`}>
                {row.warnings.length ? row.warnings.join(" ") : "OK"}
              </p>
              <button className="btn-ghost text-coral" onClick={() => onRemoveRow(index)} type="button">
                <Trash2 size={16} />
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 flex justify-end border-t border-line bg-night/95 p-4 backdrop-blur">
        <button className="btn-primary" disabled={loading} onClick={onConfirm} type="button">
          <Database size={17} />
          Valider l'import PDF
        </button>
      </div>
    </div>
  );
}

function toDateTimeLocal(value?: string) {
  if (!value) return "";
  return value.slice(0, 16);
}

function TextField({ label, onChange, placeholder, value }: { label: string; onChange: (value: string) => void; placeholder?: string; value: string }) {
  return (
    <label>
      <span className="muted mb-1 block">{label}</span>
      <input className="input min-w-0" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
    </label>
  );
}

function NumberField({
  field,
  index,
  label,
  onUpdateRow,
  row
}: {
  field: keyof Pick<ParsedAvisOperation, "quantite" | "coursExecute" | "montantTotalFrais">;
  index: number;
  label: string;
  onUpdateRow: (index: number, patch: Partial<ParsedAvisOperation>) => void;
  row: ParsedAvisOperation;
}) {
  return (
    <label>
      <span className="muted mb-1 block">{label}</span>
      <input
        className="input min-w-0"
        onChange={(event) => onUpdateRow(index, { [field]: event.target.value === "" ? undefined : Number(event.target.value) })}
        step="0.0001"
        type="number"
        value={row[field] ?? ""}
      />
    </label>
  );
}
