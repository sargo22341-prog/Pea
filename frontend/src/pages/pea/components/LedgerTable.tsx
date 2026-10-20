import type { CashLedgerDto, CashLedgerEntry, CashLedgerEntryKind } from "@pea/shared";
import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useCashFunding } from "../../../components/common/cash/useCashFunding";
import { ConfirmDialog } from "../../../components/common/feedback/ConfirmDialog";
import { usePrivacy } from "../../../contexts/privacy-context";
import { api } from "../../../lib/api";
import { cashMoney, signedCashMoney } from "../../../lib/cash/cash-format";
import { formatChartDateTime, formatNumber } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";

const filters: (CashLedgerEntryKind | "all")[] = ["all", "deposit", "withdrawal", "buy", "sell", "dividend", "fee"];

function movementId(entry: CashLedgerEntry) {
  return entry.id.startsWith("movement:") ? Number(entry.id.slice("movement:".length)) : undefined;
}

function EntryDetail({ entry, prive }: { entry: CashLedgerEntry; prive: boolean }) {
  const { t } = useTranslation("cash");
  const parts: string[] = [];
  if (entry.symbol) parts.push(entry.name && entry.name !== entry.symbol ? `${entry.symbol} - ${entry.name}` : entry.symbol);
  if (entry.quantity !== undefined && entry.price !== undefined) parts.push(t("ledger.tradeDetail", { quantity: formatNumber(entry.quantity), price: masquerValeur(cashMoney(entry.price), prive) }));
  if (entry.fees) parts.push(t("ledger.fees", { amount: masquerValeur(cashMoney(entry.fees), prive) }));
  if (entry.realizedGain !== undefined) parts.push(t("ledger.realized", { amount: masquerValeur(signedCashMoney(entry.realizedGain), prive) }));
  if (entry.note) parts.push(entry.note);
  return (
    <span>
      {parts.join(" | ")}
      {entry.absorbed ? <span className="muted ml-1 text-xs">({t("ledger.absorbed")})</span> : null}
    </span>
  );
}

/**
 * Historique chronologique du compte espèces, solde après chaque mouvement. Les mouvements espèces
 * se suppriment ici ; les achats et ventes se corrigent depuis la fiche de l'actif. Une suppression
 * qui découvrirait le compte est refusée par le backend et expliquée.
 */
export function LedgerTable({ ledger, onChanged }: { ledger: CashLedgerDto; onChanged: (ledger: CashLedgerDto) => void }) {
  const { t } = useTranslation(["cash", "common", "errors"]);
  const prive = usePrivacy();
  const [filter, setFilter] = useState<CashLedgerEntryKind | "all">("all");
  const [pendingDelete, setPendingDelete] = useState<CashLedgerEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cashFunding = useCashFunding((failure) => { setError(failure instanceof Error ? failure.message : t("errors:unknown")); });
  const entries = useMemo(() => ledger.entries.filter((entry) => filter === "all" || entry.kind === filter), [filter, ledger.entries]);

  async function remove(entry: CashLedgerEntry) {
    setPendingDelete(null);
    const id = movementId(entry);
    if (id === undefined) return;
    setError(null);
    await cashFunding.run(async () => { onChanged(await api.deleteCashMovement(id)); });
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-semibold">{t("cash:ledger.title")}</h2>
        <div className="flex flex-wrap gap-1" role="group">
          {filters.map((value) => (
            <button aria-pressed={filter === value} className={filter === value ? "btn-primary px-3 py-1 text-xs" : "btn-ghost px-3 py-1 text-xs"} key={value} onClick={() => { setFilter(value); }} type="button">
              {value === "all" ? t("cash:ledger.all") : t(`cash:kinds.${value}`)}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="m-4 rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}
      {entries.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">{t("cash:ledger.date")}</th>
                <th className="px-4 py-2">{t("cash:ledger.kind")}</th>
                <th className="px-4 py-2">{t("cash:ledger.detail")}</th>
                <th className="px-4 py-2 text-right">{t("cash:ledger.amount")}</th>
                <th className="px-4 py-2 text-right">{t("cash:ledger.balance")}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((entry) => (
                <tr className={entry.absorbed ? "opacity-60" : undefined} key={entry.id}>
                  <td className="whitespace-nowrap px-4 py-2">{formatChartDateTime(entry.effectiveAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {t(`cash:kinds.${entry.kind}`)}
                    <span className="muted block text-xs">{t(`cash:sources.${entry.source}`)}</span>
                  </td>
                  <td className="px-4 py-2"><EntryDetail entry={entry} prive={prive} /></td>
                  <td className={`whitespace-nowrap px-4 py-2 text-right font-semibold ${entry.amount >= 0 ? "text-mint" : "text-coral"}`}>{masquerValeur(signedCashMoney(entry.amount), prive)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">{masquerValeur(cashMoney(entry.balanceAfter), prive)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {movementId(entry) !== undefined ? (
                      <button aria-label={t("common:actions.delete")} className="btn-ghost px-2 text-coral" onClick={() => { setPendingDelete(entry); }} type="button"><Trash2 size={15} /></button>
                    ) : entry.symbol && (entry.kind === "buy" || entry.kind === "sell") ? (
                      <Link aria-label={t("cash:ledger.editTrade")} className="btn-ghost px-2" title={t("cash:ledger.editTrade")} to={`/assets/${encodeURIComponent(entry.symbol)}`}><Pencil size={15} /></Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-6 text-center text-sm text-slate-400">{t("cash:ledger.empty")}</p>
      )}
      {pendingDelete ? (
        <ConfirmDialog
          danger
          confirmLabel={t("common:actions.delete")}
          description={t("cash:ledger.deleteDescription", { amount: cashMoney(Math.abs(pendingDelete.amount)), date: formatChartDateTime(pendingDelete.effectiveAt) })}
          onCancel={() => { setPendingDelete(null); }}
          onConfirm={() => void remove(pendingDelete)}
          title={t("cash:ledger.deleteTitle")}
        />
      ) : null}
      {cashFunding.dialog}
    </section>
  );
}
