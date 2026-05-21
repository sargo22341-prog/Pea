import type { ObjectiveSummary } from "@pea/shared";
import { CalendarClock, Gauge, PiggyBank, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatAge, formatLeadLag, formatObjectiveDate, formatObjectiveMoney } from "../utils/formatObjective";

export function ObjectiveSummaryCards({ summary }: { summary: ObjectiveSummary }) {
  const { t } = useTranslation("objectives");
  const cards = [
    { label: t("summary.reach"), value: summary.reachedAge ? formatAge(summary.reachedAge) : formatObjectiveDate(summary.reachedDate), icon: CalendarClock },
    { label: t("summary.targetCapital"), value: formatObjectiveMoney(summary.targetCapital), icon: PiggyBank },
    { label: t("summary.leadLag"), value: formatLeadLag(summary.leadLagMonths), icon: TrendingUp },
    { label: t("summary.progress"), value: `${summary.progressPercent.toFixed(1)} %`, icon: Gauge }
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article key={card.label} className="card border border-line bg-panel/70 p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-sky/25 bg-sky/10 text-sky">
              <Icon size={18} />
            </div>
            <p className="text-xs uppercase tracking-wide text-slate-400">{card.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-50">{card.value}</p>
          </article>
        );
      })}
    </div>
  );
}
