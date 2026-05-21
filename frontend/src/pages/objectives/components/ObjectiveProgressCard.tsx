import type { ObjectiveSummary } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { formatObjectiveMoney } from "../utils/formatObjective";

export function ObjectiveProgressCard({ summary }: { summary: ObjectiveSummary }) {
  const { t } = useTranslation("objectives");
  return (
    <section className="card border border-line bg-panel/70 p-4">
      <h2 className="mb-3 text-lg font-semibold">{t("progress.title")}</h2>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-panel2">
        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, summary.progressPercent)}%` }} />
      </div>
      <p className="text-sm text-slate-300">
        {t("progress.currentCapital")} <span className="font-semibold text-slate-50">{formatObjectiveMoney(summary.currentCapital)}</span>
      </p>
    </section>
  );
}
