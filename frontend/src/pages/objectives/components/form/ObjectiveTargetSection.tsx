import { useTranslation } from "react-i18next";
import { isObjectiveFieldVisible, type ObjectiveSpecificField } from "../objectiveFormConfig";
import { Field, FormSection, SwitchField } from "./ObjectiveFormControls";
import type { ObjectiveFormState, ObjectiveFormUpdate } from "./objectiveFormState";

export function ObjectiveTargetSection({ form, update }: { form: ObjectiveFormState; update: ObjectiveFormUpdate }) {
  const { t } = useTranslation("objectives");
  const visible = (field: ObjectiveSpecificField) => isObjectiveFieldVisible(form.type, field);

  return (
    <FormSection title={t("form.objectSection")}>
      <div className="grid gap-4 md:grid-cols-2">
        {visible("targetAmount") ? (
          <Field label={t("form.fields.targetAmount")}>
            <input className="input" inputMode="decimal" onChange={(event) => update("targetAmount", event.target.value)} value={form.targetAmount} />
          </Field>
        ) : null}
        {visible("targetAge") ? (
          <Field label={t("form.fields.targetAge")}>
            <input className="input" inputMode="numeric" onChange={(event) => update("targetAge", event.target.value)} value={form.targetAge} />
          </Field>
        ) : null}
        {visible("monthlyIncome") ? (
          <Field label={t("form.fields.monthlyIncome")}>
            <input className="input" inputMode="decimal" onChange={(event) => update("monthlyIncome", event.target.value)} value={form.monthlyIncome} />
          </Field>
        ) : null}
        {visible("finalCapitalTarget") ? (
          <Field label={t("form.fields.finalCapitalTarget")}>
            <input className="input" inputMode="decimal" onChange={(event) => update("finalCapitalTarget", event.target.value)} value={form.finalCapitalTarget} />
          </Field>
        ) : null}
        {visible("indexIncomeToInflation") || visible("continueSavingsAfterAnnuityStart") ? (
          <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
            {visible("indexIncomeToInflation") ? (
              <SwitchField
                checked={form.indexIncomeToInflation}
                description={t("form.fields.indexInflationHelp")}
                label={t("form.fields.indexInflation")}
                onChange={(checked) => update("indexIncomeToInflation", checked)}
              />
            ) : null}
            {visible("continueSavingsAfterAnnuityStart") ? (
              <SwitchField
                checked={form.continueSavingsAfterAnnuityStart}
                description={t("form.fields.continueSavingsAfterAnnuityStartHelp")}
                label={t("form.fields.continueSavingsAfterAnnuityStart")}
                onChange={(checked) => update("continueSavingsAfterAnnuityStart", checked)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </FormSection>
  );
}
