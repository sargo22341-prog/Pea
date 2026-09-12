import { useTranslation } from "react-i18next";
import { usesProjectionEndAge, usesWithdrawalRate } from "../objectiveFormConfig";
import { Field, FormSection } from "./ObjectiveFormControls";
import type { ObjectiveFormState, ObjectiveFormUpdate } from "./objectiveFormState";

export function ObjectiveAssumptionsSection({ form, update }: { form: ObjectiveFormState; update: ObjectiveFormUpdate }) {
  const { t } = useTranslation("objectives");

  return (
    <FormSection title={t("form.assumptionsSection")}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("form.fields.currentAge")}>
          <input className="input" inputMode="numeric" onChange={(event) => update("currentAge", event.target.value)} value={form.currentAge} />
        </Field>
        <Field label={t("form.fields.futureMonthlySavings")}>
          <input className="input" inputMode="decimal" onChange={(event) => update("futureMonthlySavings", event.target.value)} value={form.futureMonthlySavings} />
        </Field>
        <Field label={t("form.fields.scenario")}>
          <select className="input" onChange={(event) => update("scenario", event.target.value as ObjectiveFormState["scenario"])} value={form.scenario}>
            <option value="prudent">{t("form.fields.prudent")}</option>
            <option value="normal">{t("form.fields.normal")}</option>
            <option value="optimistic">{t("form.fields.optimistic")}</option>
          </select>
        </Field>
        <Field label={t("form.fields.inflation")}>
          <input className="input" inputMode="decimal" onChange={(event) => update("inflationRate", event.target.value)} value={form.inflationRate} />
        </Field>
        <Field label={t("form.fields.annualReturn")}>
          <input className="input" inputMode="decimal" onChange={(event) => update("annualReturnRate", event.target.value)} value={form.annualReturnRate} />
        </Field>
        <Field label={t("form.fields.tax")}>
          <input className="input" inputMode="decimal" onChange={(event) => update("taxRate", event.target.value)} value={form.taxRate} />
        </Field>
        {usesWithdrawalRate(form.type) ? (
          <Field label={t("form.fields.withdrawalRate")}>
            <input className="input" inputMode="decimal" onChange={(event) => update("withdrawalRate", event.target.value)} value={form.withdrawalRate} />
          </Field>
        ) : null}
        {usesProjectionEndAge(form.type) ? (
          <Field label={t("form.fields.projectionEndAge")}>
            <input className="input" inputMode="numeric" max={120} min={70} onChange={(event) => update("projectionEndAge", event.target.value)} type="number" value={form.projectionEndAge} />
          </Field>
        ) : null}
        <Field label={t("form.fields.statePension")}>
          <input className="input" inputMode="decimal" onChange={(event) => update("statePensionMonthly", event.target.value)} value={form.statePensionMonthly} />
        </Field>
        <Field label={t("form.fields.statePensionStartAge")}>
          <input className="input" inputMode="numeric" onChange={(event) => update("statePensionStartAge", event.target.value)} value={form.statePensionStartAge} />
        </Field>
      </div>
    </FormSection>
  );
}
