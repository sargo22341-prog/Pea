import type { PositionWithMarket } from "@pea/shared";
import { Plus, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { DividendMovementDialog } from "../../../../components/common/cash/verification/DividendMovementDialog";
import { ConfirmDialog } from "../../../../components/common/feedback/ConfirmDialog";
import { MOTION } from "../../../../components/common/motion";
import { usePullToRefreshSuspended } from "../../../../hooks/usePullToRefreshSuspended";
import { toDateTimeLocalValue } from "../../../../lib/dateTimeInput";
import type { EditableTransactionFormRow } from "../editTransactionForm";
import { DividendRow } from "./DividendRow";
import { OperationFilter, type OperationFilterValue } from "./OperationFilter";
import { TransactionRow } from "./TransactionRow";
import { usePositionDividends } from "./usePositionDividends";
import { usePositionTransactions } from "./usePositionTransactions";

/**
 * Opérations d'une position : achats et ventes modifiables, dividendes encaissés en lecture seule
 * (leur fenêtre permet de les corriger ou de les vérifier), filtrables par type.
 */
export function EditPositionModal({ position, onClose, onSaved, onDeleted, startWithDraft = false }: {
  position: PositionWithMarket;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onDeleted: () => void;
  startWithDraft?: boolean;
}) {
  const { t } = useTranslation(["common", "errors", "portfolio"]);
  usePullToRefreshSuspended();
  const transactions = usePositionTransactions(position, startWithDraft, onSaved);
  const positionDividends = usePositionDividends(position.id);
  const [filter, setFilter] = useState<OperationFilterValue>("all");
  const [pendingDelete, setPendingDelete] = useState<EditableTransactionFormRow | null>(null);
  const [confirmPositionDelete, setConfirmPositionDelete] = useState(false);
  const [openedDividendId, setOpenedDividendId] = useState<string | null>(null);
  const openedDividend = positionDividends.dividends.find((entry) => entry.id === openedDividendId);

  const rows = transactions.rows.map((row, index) => ({ row, index })).filter(({ row }) => filter === "all" || (filter !== "dividend" && row.type === filter));
  const dividends = filter === "all" || filter === "dividend" ? positionDividends.dividends : [];
  const error = transactions.error ?? positionDividends.error;

  return (
    <div className={`fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:items-center sm:justify-center ${MOTION.overlay}`}>
      <div className={`card max-h-[90vh] w-full max-w-5xl overflow-hidden p-0 bg-ink/85 ${MOTION.dialog}`}>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("portfolio:position.title", { symbol: position.symbol })}</h2>
            <p className="muted">{t("portfolio:position.editTransactions")}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button className="btn-primary" onClick={() => { setFilter("all"); transactions.addDraft(); }} type="button">
              <Plus size={17} />
              {t("portfolio:position.addTransaction")}
            </button>
            <button className="btn-ghost" onClick={onClose} type="button">{t("common:actions.close")}</button>
          </div>
        </div>

        <div className="border-b border-line px-4 py-2"><OperationFilter onChange={setFilter} value={filter} /></div>
        {transactions.loading ? <p className="p-4 text-slate-400">{t("common:common.loading")}</p> : null}
        {error ? <p className="m-4 rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}

        <div className="max-h-[58vh] overflow-y-auto p-4">
          <div className="space-y-3">
            {rows.map(({ row, index }, rank) => {
              const separatesExistingRows = rank > 0 && !row.id.startsWith("draft-") && rows[rank - 1]?.row.id.startsWith("draft-");
              return (
                <Fragment key={row.id}>
                  {separatesExistingRows ? (
                    <div className="flex items-center gap-3 py-1 text-xs font-medium uppercase text-slate-500">
                      <span className="h-px flex-1 bg-line" />
                      <span>{t("portfolio:position.existingTransactions")}</span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  ) : null}
                  <TransactionRow
                    onDelete={() => { setPendingDelete(row); }}
                    onPatch={(patch) => { transactions.patchRow(index, patch); }}
                    onQuantity={(rawValue) => { transactions.patchQuantity(index, rawValue, row); }}
                    onSave={() => void transactions.save(row)}
                    onType={(type) => { transactions.patchType(index, type); }}
                    position={position}
                    row={row}
                  />
                </Fragment>
              );
            })}
            {dividends.map((entry) => <DividendRow entry={entry} key={entry.id} onOpen={() => { setOpenedDividendId(entry.id); }} />)}
            {!rows.length && !dividends.length && !transactions.loading ? (
              <div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-slate-400">
                {t(filter === "all" ? "portfolio:position.noTransactions" : "portfolio:position.filters.noOperations")}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex justify-between gap-3 border-t border-line p-4">
          <button className="btn-ghost text-coral" onClick={() => { setConfirmPositionDelete(true); }} type="button">
            <Trash2 size={17} />
            {t("portfolio:position.deleteAction")}
          </button>
          <button className="btn-primary" onClick={onClose} type="button">{t("common:actions.done")}</button>
        </div>
      </div>
      {pendingDelete ? (
        <ConfirmDialog
          danger
          confirmLabel={t("common:actions.delete")}
          description={t("portfolio:position.deleteTransactionDescription", { type: pendingDelete.type === "sell" ? t("common:states.sell").toLowerCase() : t("common:states.buy").toLowerCase(), date: toDateTimeLocalValue(pendingDelete.tradedAt).replace("T", " ") })}
          onCancel={() => { setPendingDelete(null); }}
          onConfirm={() => { const row = pendingDelete; setPendingDelete(null); void transactions.remove(row); }}
          title={t("portfolio:position.deleteTransactionTitle")}
        />
      ) : null}
      {transactions.fundingDialog}
      {openedDividend ? <DividendMovementDialog entry={openedDividend} key={`${openedDividend.id}:${String(openedDividend.amount)}:${openedDividend.effectiveAt}`} onChanged={positionDividends.replace} onClose={() => { setOpenedDividendId(null); }} /> : null}
      {confirmPositionDelete ? (
        <ConfirmDialog
          danger
          confirmLabel={t("portfolio:position.deletePositionAction")}
          description={t("portfolio:position.deletePositionDescription", { symbol: position.symbol })}
          onCancel={() => { setConfirmPositionDelete(false); }}
          onConfirm={onDeleted}
          title={t("portfolio:position.deletePositionTitle", { symbol: position.symbol })}
        />
      ) : null}
    </div>
  );
}
