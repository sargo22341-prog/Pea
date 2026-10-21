import type { FullHistoryPreview, FullHistoryTotals } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { cashMoney } from "../../../../lib/cash/cash-format";
import { formatMaybeDate } from "../../../../lib/format";
import { masquerValeur } from "../../../../lib/privacy";

const totalKeys: (keyof FullHistoryTotals)[] = ["cash", "deposits", "withdrawals", "cashDividends", "otherCredits"];

/** Ce que le passage crée, et les indicateurs avant / après : un écart signale un état initial inexact. */
export function FullHistoryComparison({ preview, after, prive }: { preview: FullHistoryPreview; after: FullHistoryTotals; prive: boolean }) {
  const { t } = useTranslation("cash");
  const money = (value: number) => masquerValeur(cashMoney(value), prive);
  const changes = [
    ...preview.creations.map((creation) => t("fullHistory.creation", { count: creation.count, kind: t(`kinds.${creation.kind}`), amount: money(creation.amount) })),
    preview.dividends.count > 0 ? t("fullHistory.dividends", { count: preview.dividends.count, amount: money(preview.dividends.amount) }) : ""
  ].filter(Boolean);

  return (
    <div className="space-y-3 text-sm">
      {changes.length ? <ul className="list-inside list-disc">{changes.map((change) => <li key={change}>{change}</li>)}</ul> : null}
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="py-1" />
            <th className="py-1 text-right">{t("fullHistory.before")}</th>
            <th className="py-1 text-right">{t("fullHistory.after")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {totalKeys.map((key) => (
            <tr className={preview.before[key] === after[key] ? "" : "text-amber"} key={key}>
              <td className="py-1">{t(`fullHistory.totals.${key}`)}</td>
              <td className="py-1 text-right">{money(preview.before[key])}</td>
              <td className="py-1 text-right">{money(after[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalKeys.some((key) => preview.before[key] !== after[key]) ? <p className="text-amber">{t("fullHistory.differences")}</p> : null}
      {preview.negativeBalanceAt ? <p className="text-amber">{t("fullHistory.negative", { date: formatMaybeDate(preview.negativeBalanceAt) })}</p> : null}
    </div>
  );
}
