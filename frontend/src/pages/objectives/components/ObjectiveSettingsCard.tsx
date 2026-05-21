import type { ObjectiveDto } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { formatObjectiveMoney } from "../utils/formatObjective";
import { objectiveTypes } from "./objectiveFormConfig";

export function ObjectiveSettingsCard({ objective }: { objective: ObjectiveDto }) {
  const { t } = useTranslation("objectives");
  const config = objective.config;
  const typeLabelKey = objectiveTypes.find((type) => type.value === objective.type)?.labelKey;
  const rows = [
    [t("settings.type"), typeLabelKey ? t(typeLabelKey) : objective.type],
    ...(config.targetAmount !== undefined ? [[t("settings.targetAmount"), formatObjectiveMoney(config.targetAmount)]] : []),
    ...(config.targetAge !== undefined ? [[t("settings.targetAge"), t("settings.ageValue", { age: config.targetAge })]] : []),
    ...(config.monthlyIncome !== undefined ? [[t("settings.monthlyIncome"), formatObjectiveMoney(config.monthlyIncome)]] : []),
    ...(config.finalCapitalTarget !== undefined ? [[t("settings.finalCapital"), formatObjectiveMoney(config.finalCapitalTarget)]] : []),
    [t("settings.inflationIndex"), config.indexIncomeToInflation ? t("settings.yes") : t("settings.no")],
    ...(objective.type !== "fixed_capital" ? [[t("settings.continueSavingsAfterAnnuityStart"), config.continueSavingsAfterAnnuityStart ? t("settings.yes") : t("settings.no")]] : [])
  ];

  return (
    <section className="card border border-line bg-panel/70 p-4">
      <h2 className="mb-3 text-lg font-semibold">{t("settings.title")}</h2>
      <dl className="grid gap-2 text-sm">
        {rows.map(([label, value]) => (
          <div className="flex justify-between gap-3 border-b border-line/60 pb-2 last:border-0 last:pb-0" key={label}>
            <dt className="text-slate-400">{label}</dt>
            <dd className="text-right font-medium text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
