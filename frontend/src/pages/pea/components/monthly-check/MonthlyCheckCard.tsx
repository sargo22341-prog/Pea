import type { CashMonthCheck } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../../contexts/privacy-context";
import { useAsync } from "../../../../hooks/useAsync";
import { api } from "../../../../lib/api";
import { MonthlyCheckRow } from "./MonthlyCheckRow";

/** Mois qui demandent une action : écart ou relevé manquant. */
const toReview = (month: CashMonthCheck) => month.status === "mismatch" || month.status === "missing";

/**
 * Contrôle mensuel du compte dans « Mon PEA » : solde de fin de mois de chaque relevé espèces
 * contre le solde calculé, causes de l'écart et documents manquants. `version` change à chaque
 * écriture du journal : le contrôle est alors relu.
 */
export function MonthlyCheckCard({ version }: { version: string }) {
  const { t } = useTranslation("cash");
  const prive = usePrivacy();
  const check = useAsync((signal) => api.cashMonthlyCheck(signal), version, { cacheKey: "cash-monthly-check" });
  const [onlyToReview, setOnlyToReview] = useState(true);

  if (check.error) return <section className="card border-coral p-4 text-coral">{check.error}</section>;
  if (!check.data) return null;
  const { months, counts } = check.data;
  const shown = onlyToReview ? months.filter(toReview) : months;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">{t("monthlyCheck.title")}</h2>
          <p className="muted text-sm">{months.length ? t("monthlyCheck.counts", { ok: counts.ok, mismatch: counts.mismatch, missing: counts.missing }) : t("monthlyCheck.empty")}</p>
          {months.length ? <p className="muted text-xs">{t("monthlyCheck.hint")}</p> : null}
        </div>
        {months.length ? (
          <div className="flex shrink-0 gap-1" role="group">
            {[true, false].map((value) => (
              <button aria-pressed={onlyToReview === value} className={onlyToReview === value ? "btn-primary px-3 py-1 text-xs" : "btn-ghost px-3 py-1 text-xs"} key={String(value)} onClick={() => { setOnlyToReview(value); }} type="button">
                {value ? t("monthlyCheck.toReview") : t("monthlyCheck.all")}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {months.length && !shown.length ? <p className="p-4 text-sm text-mint">{t("monthlyCheck.nothingToReview")}</p> : null}
      {shown.length ? (
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">{t("monthlyCheck.month")}</th>
                <th className="px-4 py-2">{t("monthlyCheck.status")}</th>
                <th className="px-4 py-2 text-right">{t("monthlyCheck.statementBalance")}</th>
                <th className="px-4 py-2 text-right">{t("monthlyCheck.appBalance")}</th>
                <th className="px-4 py-2 text-right">{t("monthlyCheck.difference")}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((month) => <MonthlyCheckRow key={month.period} month={month} prive={prive} />)}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
