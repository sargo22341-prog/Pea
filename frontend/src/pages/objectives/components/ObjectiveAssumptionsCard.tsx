import type { ObjectiveAssumptions } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { formatObjectiveMoney } from "../utils/formatObjective";

export function ObjectiveAssumptionsCard({ assumptions }: { assumptions: ObjectiveAssumptions }) {
  const { t } = useTranslation("objectives");
  const rows = [
    [t("assumptions.currentAge"), assumptions.currentAge ? t("settings.ageValue", { age: assumptions.currentAge }) : t("assumptions.toComplete")],
    [t("assumptions.futureSavings"), assumptions.futureMonthlySavings === undefined || assumptions.futureMonthlySavings === null ? t("assumptions.historicalFallback") : t("assumptions.monthlyMoney", { amount: formatObjectiveMoney(assumptions.futureMonthlySavings) })],
    [t("assumptions.inflation"), t("assumptions.percent", { value: assumptions.inflationRate })],
    [t("assumptions.annualReturn"), t("assumptions.percent", { value: assumptions.annualReturnRate })],
    [t("assumptions.tax"), t("assumptions.percent", { value: assumptions.taxRate })],
    [t("assumptions.withdrawal"), assumptions.withdrawalRate ? t("assumptions.percent", { value: assumptions.withdrawalRate }) : t("values.na")],
    [t("assumptions.projectionEndAge"), assumptions.projectionEndAge ? t("settings.ageValue", { age: assumptions.projectionEndAge }) : t("settings.ageValue", { age: 90 })],
    [t("assumptions.statePension"), t("assumptions.statePensionValue", { amount: formatObjectiveMoney(assumptions.statePensionMonthly), age: assumptions.statePensionStartAge })],
    [t("assumptions.scenario"), t(`form.fields.${assumptions.scenario}`)]
  ];

  return (
    <section className="card border border-line bg-panel/70 p-4">
      <h2 className="mb-3 text-lg font-semibold">{t("assumptions.title")}</h2>
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
