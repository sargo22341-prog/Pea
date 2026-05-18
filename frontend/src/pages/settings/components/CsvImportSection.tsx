import type { BoursoramaImportRow, BoursoramaUpdateRow } from "@pea/shared";
import { Database, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
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

function detectedAssetLabel(row: BoursoramaImportRow | BoursoramaUpdateRow, t: (key: string, options?: Record<string, unknown>) => string) {
  if (row.detectedAsset) {
    const asset = `${row.detectedAsset.symbol} - ${row.detectedAsset.name} ${Math.round(row.detectedAsset.confidenceScore * 100)}%`;
    return t("imports.detectedAsset", { asset, ns: "settings" });
  }
  if (row.symbol) return t("imports.detectedAsset", { asset: row.symbol, ns: "settings" });
  return t("imports.detectedAssetMissing", { ns: "settings" });
}

export function CsvImportSection() {
  const { t } = useTranslation(["common", "settings"]);
  const csvImport = useCsvImport();

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">{t("imports.csvTitle", { ns: "settings" })}</h2>
          <p className="muted">{t("imports.csvHelp", { ns: "settings" })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="btn-ghost cursor-pointer">
            <Upload size={17} />
            {t("imports.importCsv", { ns: "settings" })}
            <input accept=".csv,text/csv" className="hidden" onChange={(event) => void csvImport.importCsv(event.target.files?.[0])} type="file" />
          </label>
          <label className="btn-ghost cursor-pointer">
            <Upload size={17} />
            {t("imports.updateCsv", { ns: "settings" })}
            <input accept=".csv,text/csv" className="hidden" onChange={(event) => void csvImport.previewUpdate(event.target.files?.[0])} type="file" />
          </label>
        </div>
      </div>
      {csvImport.message && <p className="p-4 text-sm text-mint">{csvImport.message}</p>}
      {csvImport.loading && <p className="p-4 text-slate-400">{t("imports.processing", { ns: "settings" })}</p>}
      {csvImport.rows.length > 0 && <ImportPreviewTable loading={csvImport.loading} onConfirm={() => void csvImport.confirmImport()} onUpdateRow={csvImport.updateImportRow} rows={csvImport.rows} />}
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
  const { t } = useTranslation(["common", "settings"]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-ink text-left text-slate-400">
          <tr>
            <th className="p-3">{t("fields.name", { ns: "common" })}</th>
            <th className="p-3">ISIN</th>
            <th className="p-3">{t("fields.quantity", { ns: "common" })}</th>
            <th className="p-3">PRU</th>
            <th className="p-3">{t("fields.symbol", { ns: "common" })}</th>
            <th className="p-3">{t("imports.action", { ns: "settings" })}</th>
            <th className="p-3">{t("imports.status", { ns: "settings" })}</th>
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
                <p className="mt-1 text-xs text-slate-400">{detectedAssetLabel(row, t)}</p>
              </td>
              <td className="p-3">
                <select className="input" onChange={(event) => onUpdateRow(index, { action: event.target.value as BoursoramaImportRow["action"] })} value={row.action ?? "merge"}>
                  <option value="merge">{t("imports.merge", { ns: "settings" })}</option>
                  <option value="replace">{t("imports.replace", { ns: "settings" })}</option>
                  <option value="ignore">{t("imports.ignore", { ns: "settings" })}</option>
                </select>
              </td>
              <td className={`p-3 ${row.errors.length ? "text-coral" : row.needsReview ? "text-amber" : "text-mint"}`}>{row.errors.length ? row.errors.join(", ") : row.needsReview ? t("imports.toReview", { ns: "settings" }) : "OK"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end p-4">
        <button className="btn-primary" disabled={loading} onClick={onConfirm} type="button">
          <Database size={17} />
          {t("imports.importCsv", { ns: "settings" })}
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
  const { t } = useTranslation(["common", "settings"]);
  return (
    <div className="overflow-x-auto">
      <label className="flex items-center gap-2 p-4 text-sm text-slate-400">
        <input checked={showUnchanged} onChange={(event) => onShowUnchangedChange(event.target.checked)} type="checkbox" />
        {t("imports.showUnchanged", { ns: "settings" })}
      </label>
      <table className="w-full min-w-[1120px] text-sm">
        <thead className="bg-ink text-left text-slate-400">
          <tr>
            <th className="p-3">{t("fields.name", { ns: "common" })}</th>
            <th className="p-3">ISIN</th>
            <th className="p-3">{t("fields.symbol", { ns: "common" })}</th>
            <th className="p-3">{t("imports.appQuantity", { ns: "settings" })}</th>
            <th className="p-3">{t("imports.csvQuantity", { ns: "settings" })}</th>
            <th className="p-3">{t("imports.diff", { ns: "settings" })}</th>
            <th className="p-3">{t("imports.appAveragePrice", { ns: "settings" })}</th>
            <th className="p-3">{t("imports.csvAveragePrice", { ns: "settings" })}</th>
            <th className="p-3">{t("imports.averagePriceDiff", { ns: "settings" })}</th>
            <th className="p-3">{t("imports.action", { ns: "settings" })}</th>
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
                  <p className="mt-1 text-xs text-slate-400">{detectedAssetLabel(row, t)}</p>
                </td>
                <td className="p-3">{row.currentQuantity ?? 0}</td>
                <td className={`p-3 ${hasFieldError(row.errors, "quantity") ? "text-coral" : ""}`}>{row.csvQuantity}</td>
                <td className={`p-3 ${row.quantityDiff >= 0 ? "text-mint" : "text-coral"}`}>{row.quantityDiff}</td>
                <td className="p-3">{row.currentAverageBuyPrice ?? "n/a"}</td>
                <td className={`p-3 ${hasFieldError(row.errors, "price") ? "text-coral" : ""}`}>{row.csvAverageBuyPrice}</td>
                <td className={`p-3 ${averageBuyPriceDiff >= 0 ? "text-mint" : "text-coral"}`}>
                  {averageBuyPriceChanged ? averageBuyPriceDiff.toLocaleString("fr-FR", { maximumFractionDigits: 4 }) : "0"}
                  {averageBuyPriceChanged && <span className="ml-2 rounded bg-mint/10 px-2 py-1 text-[11px] font-semibold text-mint">{t("imports.averagePriceUpdated", { ns: "settings" })}</span>}
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
          {t("imports.confirmUpdate", { ns: "settings" })}
        </button>
      </div>
    </div>
  );
}
