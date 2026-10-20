import type { EditablePortfolioTransaction, PositionWithMarket } from "@pea/shared";
import { Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toDateTimeLocalValue } from "../../../../lib/dateTimeInput";
import { maxSellQuantity, type EditableTransactionFormRow } from "../editTransactionForm";
import { SplitAdjustedNote } from "../splits/SplitAdjustedNote";

/** Achat ou vente modifiable d'une position (brouillon à remplir ou transaction existante). */
export function TransactionRow({ row, position, onPatch, onType, onQuantity, onSave, onDelete }: {
  row: EditableTransactionFormRow;
  position: PositionWithMarket;
  onPatch: (patch: Partial<EditableTransactionFormRow>) => void;
  onType: (type: EditablePortfolioTransaction["type"]) => void;
  onQuantity: (rawValue: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation(["common", "portfolio"]);
  const isDraft = row.id.startsWith("draft-");

  return (
    <div className={`rounded-md border p-3 ${isDraft ? "border-mint/50 bg-mint/5" : "border-line bg-ink/60"}`}>
      {isDraft ? <p className="mb-3 text-xs font-medium uppercase text-mint">{t("portfolio:position.toFill")}</p> : null}
      <div className="grid gap-3 md:grid-cols-[minmax(190px,1.5fr)_120px_1fr_1fr_1fr_110px_auto_auto] md:items-end">
        <label>
          <span className="muted mb-1 block">{t("common:fields.date")}</span>
          <input className="input" onChange={(event) => { onPatch({ tradedAt: event.target.value, dateExecution: event.target.value }); }} type="datetime-local" value={toDateTimeLocalValue(row.tradedAt)} />
        </label>
        <label>
          <span className="muted mb-1 block">{t("common:fields.side")}</span>
          <select className="input" onChange={(event) => { onType(event.target.value as EditablePortfolioTransaction["type"]); }} value={row.type}>
            <option value="buy">{t("common:states.buy")}</option>
            <option value="sell">{t("common:states.sell")}</option>
          </select>
        </label>
        <label>
          <span className="muted mb-1 block">{t("common:fields.quantity")}</span>
          <input className="input" max={row.type === "sell" ? maxSellQuantity(row, position) : undefined} min="0" onChange={(event) => { onQuantity(event.target.value); }} step="any" type="number" value={row.quantity} />
          {row.splitFactor ? <SplitAdjustedNote currency={row.currency} factor={row.splitFactor} price={Number(row.price)} quantity={Number(row.quantity)} /> : null}
        </label>
        <label>
          <span className="muted mb-1 block">{t("common:fields.price")}</span>
          <input className="input" min="0" onChange={(event) => { onPatch({ price: event.target.value, executedPrice: event.target.value }); }} step="any" type="number" value={row.price} />
        </label>
        <label>
          <span className="muted mb-1 block">{t("common:fields.fees")}</span>
          <input className="input" min="0" onChange={(event) => { onPatch({ totalFees: event.target.value }); }} step="any" type="number" value={row.totalFees} />
        </label>
        <label>
          <span className="muted mb-1 block">{t("common:fields.currency")}</span>
          <input className="input" onChange={(event) => { onPatch({ currency: event.target.value.toUpperCase() }); }} value={row.currency} />
        </label>
        <button className="btn-primary" onClick={onSave} type="button">
          <Save size={16} />
          {t("portfolio:position.save")}
        </button>
        <button aria-label={t("common:actions.delete")} className="btn-ghost text-coral" onClick={onDelete} type="button">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
