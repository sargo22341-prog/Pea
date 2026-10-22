import type { PortfolioYearReturn } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../../contexts/privacy-context";
import { cashMoney } from "../../../../lib/cash/cash-format";
import { percent } from "../../../../lib/format";
import { MISSING_VALUE } from "../../../../lib/format-metrics";
import { masquerValeur } from "../../../../lib/privacy";

function toneClass(value: number | undefined) {
  if (value === undefined) return "";
  return value >= 0 ? "text-mint" : "text-coral";
}

/** Détail de chaque année civile : valeur de départ, apports nets, plus-values, dividendes et rendement. */
export function AnnualReturnsTable({ years }: { years: PortfolioYearReturn[] }) {
  const { t } = useTranslation("cash");
  const prive = usePrivacy();
  const show = (value: number) => masquerValeur(cashMoney(value), prive);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">{t("returns.columns.year")}</th>
            <th className="px-3 py-2 text-right">{t("returns.columns.startValue")}</th>
            <th className="px-3 py-2 text-right">{t("returns.columns.netInvested")}</th>
            <th className="px-3 py-2 text-right">{t("returns.columns.capitalGain")}</th>
            <th className="px-3 py-2 text-right">{t("returns.columns.dividends")}</th>
            <th className="px-3 py-2 text-right">{t("returns.columns.endValue")}</th>
            <th className="px-3 py-2 text-right">{t("returns.columns.return")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {[...years].reverse().map((row) => (
            <tr key={row.year}>
              <td className="whitespace-nowrap px-3 py-2 font-semibold">{row.partial ? t("returns.partialMark", { year: row.year }) : row.year}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{show(row.startValue)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{show(row.invested - row.sold)}</td>
              <td className={`whitespace-nowrap px-3 py-2 text-right ${toneClass(row.capitalGain)}`}>{show(row.capitalGain)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{show(row.dividends)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{show(row.endValue)}</td>
              <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${toneClass(row.returnPercent)}`}>
                {row.returnPercent === undefined ? MISSING_VALUE : percent(row.returnPercent)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
