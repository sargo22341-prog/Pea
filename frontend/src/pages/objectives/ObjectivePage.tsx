import type { User } from "@pea/shared";
import { Edit3 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMaybeDate } from "../../lib/format";
import { ObjectiveAssumptionsCard } from "./components/ObjectiveAssumptionsCard";
import { ObjectiveContributionChart } from "./components/ObjectiveContributionChart";
import { ObjectiveEditModal } from "./components/ObjectiveEditModal";
import { ObjectiveEmptyState } from "./components/ObjectiveEmptyState";
import { ObjectiveExplanationMessage } from "./components/ObjectiveExplanationMessage";
import { ObjectiveMissingDataState } from "./components/ObjectiveMissingDataState";
import { ObjectiveProgressCard } from "./components/ObjectiveProgressCard";
import { ObjectiveProjectionChart } from "./components/ObjectiveProjectionChart";
import { ObjectiveSettingsCard } from "./components/ObjectiveSettingsCard";
import { ObjectiveSummaryCards } from "./components/ObjectiveSummaryCards";
import { useObjectives } from "./hooks/useObjectives";

export function ObjectivePage({ user }: { user: User }) {
  const { t } = useTranslation(["objectives", "common"]);
  const objectives = useObjectives(user.id);
  const objective = objectives.activeObjective;
  const projection = objective?.projection;
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    document.title = `${t("objectives:title")} | PEA Portfolio`;
    return () => {
      document.title = "PEA Portfolio";
    };
  }, [t]);

  if (objectives.loading) return <div className="card p-6">{t("objectives:loading")}</div>;
  if (objectives.error) return <div className="rounded-lg border border-coral/40 bg-coral/10 p-4 text-sm text-rose-100">{objectives.error}</div>;
  if (!objective || !projection) return <ObjectiveEmptyState />;

  return (
    <div className="min-w-0 space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <p className="text-sm text-slate-400">{t("objectives:title")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold">{objective.title}</h1>
              {objective.active ? <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-200">{t("objectives:active")}</span> : null}
            </div>
          </div>
        </div>
        <button className="btn-ghost" onClick={() => setEditing(true)} type="button">
          <Edit3 size={16} />
          {t("objectives:edit")}
        </button>
      </header>

      {projection.status === "missing_data" ? <ObjectiveMissingDataState items={projection.missingData} /> : null}
      {projection.summary ? <ObjectiveSummaryCards summary={projection.summary} /> : null}
      <ObjectiveProjectionChart projection={projection} />
      <ObjectiveExplanationMessage objective={objective} projection={projection} />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <ObjectiveSettingsCard objective={objective} />
          <ObjectiveContributionChart data={projection.contributions} />
        </div>
        <div className="space-y-4">
          <ObjectiveAssumptionsCard assumptions={objective.assumptions} />
          {projection.summary ? <ObjectiveProgressCard summary={projection.summary} /> : null}
          <section className="card border border-line bg-panel/70 p-4 text-sm text-slate-300">
            <p>{t("objectives:updatedAt")}: <span className="text-slate-100">{formatMaybeDate(projection.lastUpdatedAt)}</span></p>
            <p className="mt-1">{t("objectives:nextUpdate")}: <span className="text-slate-100">{formatMaybeDate(projection.nextUpdateAt)} {t("objectives:around23")}</span></p>
          </section>
        </div>
      </div>
      {editing ? (
        <ObjectiveEditModal
          objective={objective}
          onClose={() => setEditing(false)}
          onSaved={() => objectives.reload()}
          userId={user.id}
        />
      ) : null}
    </div>
  );
}
