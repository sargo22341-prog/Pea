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
      <div className="flex items-center gap-2 p-4 text-sm text-slate-400">
        <FileText size={16} />
        {"Extraction -> previsualisation -> resolution actif -> correction -> validation"}
      </div>
      <div className="space-y-4 p-4 pt-0">
        {rows.map((row, index) => (
          <div className={`rounded-md border p-4 ${row.potentialDuplicate ? "border-amber/60 bg-amber/5" : "border-line bg-ink/40"}`} key={`${row.sourceFileName}-${index}`}>
            <div className="grid gap-3 lg:grid-cols-[minmax(190px,1.2fr)_minmax(220px,1.4fr)_minmax(150px,1fr)_minmax(220px,1.4fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)]">
              <TextField label="Date execution" onChange={(value) => onUpdateRow(index, { dateExecution: value })} value={row.dateExecution ?? ""} />
              <TextField label="Valeur" onChange={(value) => onUpdateRow(index, { nomValeur: value })} value={row.nomValeur ?? ""} />
              <TextField label="ISIN" onChange={(value) => onUpdateRow(index, { isin: value.toUpperCase() })} value={row.isin ?? ""} />
              <ReadField label="Actif detecte" value={row.resolvedAsset ? `${row.resolvedAsset.name} (${Math.round(row.resolvedAsset.confidenceScore * 100)}%)` : "A choisir"} />
              <TextField label="Ticker choisi" onChange={(value) => onUpdateRow(index, { selectedSymbol: value.toUpperCase() })} value={row.selectedSymbol ?? ""} />
              <label>
                <span className="muted mb-1 block">Sens</span>
                <select className="input min-w-36" onChange={(event) => onUpdateRow(index, { sensOperation: event.target.value as ParsedAvisOperation["sensOperation"] })} value={row.sensOperation}>
                  <option value="achat">Achat</option>
                  <option value="vente">Vente</option>
                  <option value="inconnu">Inconnu</option>
                </select>
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
              <NumberField field="quantite" index={index} label="Qte" onUpdateRow={onUpdateRow} row={row} />
              <NumberField field="coursExecute" index={index} label="Cours" onUpdateRow={onUpdateRow} row={row} />
              <NumberField field="montantBrut" index={index} label="Brut" onUpdateRow={onUpdateRow} row={row} />
              <NumberField field="commission" index={index} label="Commission" onUpdateRow={onUpdateRow} row={row} />
              <NumberField field="frais" index={index} label="Frais" onUpdateRow={onUpdateRow} row={row} />
              <NumberField field="montantTotalFrais" index={index} label="Total frais" onUpdateRow={onUpdateRow} row={row} />
              <NumberField field="montantNet" index={index} label="Net" onUpdateRow={onUpdateRow} row={row} />
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

function TextField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label>
      <span className="muted mb-1 block">{label}</span>
      <input className="input min-w-0" onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="muted mb-1 block">{label}</span>
      <div className="input min-h-10 truncate text-slate-300">{value}</div>
    </div>
  );
}

function NumberField({
  field,
  index,
  label,
  onUpdateRow,
  row
}: {
  field: keyof Pick<ParsedAvisOperation, "quantite" | "coursExecute" | "montantBrut" | "commission" | "frais" | "montantTotalFrais" | "montantNet">;
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
