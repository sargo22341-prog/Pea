import type { ObjectiveDto, ObjectiveInput, ObjectiveType } from "@pea/shared";
import type React from "react";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../lib/api";
import { isObjectiveFieldVisible, objectiveFieldsByType, objectiveTypes, type ObjectiveSpecificField, usesProjectionEndAge, usesWithdrawalRate } from "./objectiveFormConfig";

type FormState = {
  title: string;
  type: ObjectiveType;
  active: boolean;
  targetAmount: string;
  targetAge: string;
  monthlyIncome: string;
  indexIncomeToInflation: boolean;
  continueSavingsAfterAnnuityStart: boolean;
  finalCapitalTarget: string;
  currentAge: string;
  futureMonthlySavings: string;
  inflationRate: string;
  annualReturnRate: string;
  taxRate: string;
  withdrawalRate: string;
  projectionEndAge: string;
  statePensionMonthly: string;
  statePensionStartAge: string;
  scenario: "prudent" | "normal" | "optimistic";
};

function numberValue(value: string) {
  if (value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function formFromObjective(objective: ObjectiveDto): FormState {
  return {
    title: objective.title,
    type: objective.type,
    active: objective.active ?? true,
    targetAmount: objective.config.targetAmount?.toString() ?? "",
    targetAge: objective.config.targetAge?.toString() ?? "",
    monthlyIncome: objective.config.monthlyIncome?.toString() ?? "",
    indexIncomeToInflation: Boolean(objective.config.indexIncomeToInflation),
    continueSavingsAfterAnnuityStart: Boolean(objective.config.continueSavingsAfterAnnuityStart),
    finalCapitalTarget: objective.config.finalCapitalTarget?.toString() ?? "",
    currentAge: objective.assumptions.currentAge?.toString() ?? "",
    futureMonthlySavings: objective.assumptions.futureMonthlySavings?.toString() ?? "",
    inflationRate: objective.assumptions.inflationRate.toString(),
    annualReturnRate: objective.assumptions.annualReturnRate.toString(),
    taxRate: objective.assumptions.taxRate.toString(),
    withdrawalRate: (objective.assumptions.withdrawalRate ?? 4).toString(),
    projectionEndAge: (objective.assumptions.projectionEndAge ?? 90).toString(),
    statePensionMonthly: objective.assumptions.statePensionMonthly.toString(),
    statePensionStartAge: objective.assumptions.statePensionStartAge.toString(),
    scenario: objective.assumptions.scenario
  };
}

function toInput(form: FormState): ObjectiveInput {
  const visible = new Set<ObjectiveSpecificField>(objectiveFieldsByType[form.type]);
  const include = (field: ObjectiveSpecificField) => visible.has(field);

  return {
    title: form.title,
    type: form.type,
    active: form.active,
    config: {
      targetAmount: include("targetAmount") ? numberValue(form.targetAmount) : undefined,
      targetAge: include("targetAge") ? numberValue(form.targetAge) : undefined,
      monthlyIncome: include("monthlyIncome") ? numberValue(form.monthlyIncome) : undefined,
      indexIncomeToInflation: include("indexIncomeToInflation") ? form.indexIncomeToInflation : undefined,
      continueSavingsAfterAnnuityStart: include("continueSavingsAfterAnnuityStart") ? form.continueSavingsAfterAnnuityStart : undefined,
      finalCapitalTarget: include("finalCapitalTarget") ? numberValue(form.finalCapitalTarget) : undefined
    },
    assumptions: {
      currentAge: numberValue(form.currentAge),
      futureMonthlySavings: numberValue(form.futureMonthlySavings),
      inflationRate: numberValue(form.inflationRate) ?? 2.5,
      annualReturnRate: numberValue(form.annualReturnRate) ?? 7,
      taxRate: numberValue(form.taxRate) ?? 21,
      withdrawalRate: usesWithdrawalRate(form.type) ? numberValue(form.withdrawalRate) ?? 4 : undefined,
      projectionEndAge: usesProjectionEndAge(form.type) ? numberValue(form.projectionEndAge) ?? 90 : undefined,
      statePensionMonthly: numberValue(form.statePensionMonthly) ?? 1000,
      statePensionStartAge: numberValue(form.statePensionStartAge) ?? 67,
      scenario: form.scenario
    }
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SwitchField({
  checked,
  description,
  label,
  onChange
}: {
  checked: boolean;
  description?: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-line bg-ink p-3 text-sm text-slate-300">
      <button
        aria-checked={checked}
        aria-label={label}
        className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${checked ? "bg-mint" : "bg-panel2"}`}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span className={`h-4 w-4 rounded-full bg-white transition ${checked ? "translate-x-5" : ""}`} />
      </button>
      <span>
        <span className="block font-medium text-slate-100">{label}</span>
        {description ? <span className="muted mt-1 block">{description}</span> : null}
      </span>
    </label>
  );
}

function cleanHiddenFields(form: FormState, type: ObjectiveType): FormState {
  const visible = new Set<ObjectiveSpecificField>(objectiveFieldsByType[type]);
  return {
    ...form,
    type,
    targetAmount: visible.has("targetAmount") ? form.targetAmount : "",
    targetAge: visible.has("targetAge") ? form.targetAge : "",
    monthlyIncome: visible.has("monthlyIncome") ? form.monthlyIncome : "",
    finalCapitalTarget: visible.has("finalCapitalTarget") ? form.finalCapitalTarget : "",
    indexIncomeToInflation: visible.has("indexIncomeToInflation") ? form.indexIncomeToInflation : false,
    continueSavingsAfterAnnuityStart: visible.has("continueSavingsAfterAnnuityStart") ? form.continueSavingsAfterAnnuityStart : false
  };
}

export function ObjectiveEditModal({
  objective,
  userId,
  onClose,
  onSaved
}: {
  objective: ObjectiveDto;
  userId: number | string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useTranslation(["objectives", "common"]);
  const [form, setForm] = useState(() => formFromObjective(objective));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedType = useMemo(() => objectiveTypes.find((type) => type.value === form.type), [form.type]);
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const visible = (field: ObjectiveSpecificField) => isObjectiveFieldVisible(form.type, field);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.updateObjective(userId, objective.id, toInput(form));
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("objectives:form.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-0 sm:place-items-center sm:p-4">
      <form className="max-h-[92vh] w-full overflow-auto rounded-t-lg border border-line bg-panel p-4 shadow-xl sm:max-w-3xl sm:rounded-lg" onSubmit={submit}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("objectives:form.title")}</h2>
            <p className="muted">{selectedType ? t(`objectives:${selectedType.labelKey}`) : ""}</p>
          </div>
          <button className="btn-ghost h-9 w-9 p-0" onClick={onClose} title={t("common:actions.close")} type="button">
            <X size={18} />
          </button>
        </div>

        {error ? <div className="mb-4 rounded-lg border border-coral/40 bg-coral/10 p-3 text-sm text-rose-100">{error}</div> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("objectives:form.fields.title")}>
            <input className="input" onChange={(event) => update("title", event.target.value)} value={form.title} />
          </Field>
          <Field label={t("objectives:form.fields.type")}>
            <select className="input" onChange={(event) => setForm((current) => cleanHiddenFields(current, event.target.value as ObjectiveType))} value={form.type}>
              {objectiveTypes.map((type) => <option key={type.value} value={type.value}>{t(`objectives:${type.labelKey}`)}</option>)}
            </select>
          </Field>
        </div>

        <section className="mt-5">
          <h3 className="mb-3 text-sm font-semibold uppercase text-slate-400">{t("objectives:form.objectSection")}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {visible("targetAmount") ? (
              <Field label={t("objectives:form.fields.targetAmount")}>
                <input className="input" inputMode="decimal" onChange={(event) => update("targetAmount", event.target.value)} value={form.targetAmount} />
              </Field>
            ) : null}
            {visible("targetAge") ? (
              <Field label={t("objectives:form.fields.targetAge")}>
                <input className="input" inputMode="numeric" onChange={(event) => update("targetAge", event.target.value)} value={form.targetAge} />
              </Field>
            ) : null}
            {visible("monthlyIncome") ? (
              <Field label={t("objectives:form.fields.monthlyIncome")}>
                <input className="input" inputMode="decimal" onChange={(event) => update("monthlyIncome", event.target.value)} value={form.monthlyIncome} />
              </Field>
            ) : null}
            {visible("finalCapitalTarget") ? (
              <Field label={t("objectives:form.fields.finalCapitalTarget")}>
                <input className="input" inputMode="decimal" onChange={(event) => update("finalCapitalTarget", event.target.value)} value={form.finalCapitalTarget} />
              </Field>
            ) : null}
            {visible("indexIncomeToInflation") || visible("continueSavingsAfterAnnuityStart") ? (
              <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
                {visible("indexIncomeToInflation") ? (
                  <SwitchField
                    checked={form.indexIncomeToInflation}
                    description={t("objectives:form.fields.indexInflationHelp")}
                    label={t("objectives:form.fields.indexInflation")}
                    onChange={(checked) => update("indexIncomeToInflation", checked)}
                  />
                ) : null}
                {visible("continueSavingsAfterAnnuityStart") ? (
                  <SwitchField
                    checked={form.continueSavingsAfterAnnuityStart}
                    description={t("objectives:form.fields.continueSavingsAfterAnnuityStartHelp")}
                    label={t("objectives:form.fields.continueSavingsAfterAnnuityStart")}
                    onChange={(checked) => update("continueSavingsAfterAnnuityStart", checked)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-5">
          <h3 className="mb-3 text-sm font-semibold uppercase text-slate-400">{t("objectives:form.assumptionsSection")}</h3>
          <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("objectives:form.fields.currentAge")}>
            <input className="input" inputMode="numeric" onChange={(event) => update("currentAge", event.target.value)} value={form.currentAge} />
          </Field>
          <Field label={t("objectives:form.fields.futureMonthlySavings")}>
            <input className="input" inputMode="decimal" onChange={(event) => update("futureMonthlySavings", event.target.value)} value={form.futureMonthlySavings} />
          </Field>
          <Field label={t("objectives:form.fields.scenario")}>
            <select className="input" onChange={(event) => update("scenario", event.target.value as FormState["scenario"])} value={form.scenario}>
              <option value="prudent">{t("objectives:form.fields.prudent")}</option>
              <option value="normal">{t("objectives:form.fields.normal")}</option>
              <option value="optimistic">{t("objectives:form.fields.optimistic")}</option>
            </select>
          </Field>
          <Field label={t("objectives:form.fields.inflation")}>
            <input className="input" inputMode="decimal" onChange={(event) => update("inflationRate", event.target.value)} value={form.inflationRate} />
          </Field>
          <Field label={t("objectives:form.fields.annualReturn")}>
            <input className="input" inputMode="decimal" onChange={(event) => update("annualReturnRate", event.target.value)} value={form.annualReturnRate} />
          </Field>
          <Field label={t("objectives:form.fields.tax")}>
            <input className="input" inputMode="decimal" onChange={(event) => update("taxRate", event.target.value)} value={form.taxRate} />
          </Field>
          {usesWithdrawalRate(form.type) ? (
            <Field label={t("objectives:form.fields.withdrawalRate")}>
              <input className="input" inputMode="decimal" onChange={(event) => update("withdrawalRate", event.target.value)} value={form.withdrawalRate} />
            </Field>
          ) : null}
          {usesProjectionEndAge(form.type) ? (
            <Field label={t("objectives:form.fields.projectionEndAge")}>
              <input className="input" inputMode="numeric" max={120} min={70} onChange={(event) => update("projectionEndAge", event.target.value)} type="number" value={form.projectionEndAge} />
            </Field>
          ) : null}
          <Field label={t("objectives:form.fields.statePension")}>
            <input className="input" inputMode="decimal" onChange={(event) => update("statePensionMonthly", event.target.value)} value={form.statePensionMonthly} />
          </Field>
          <Field label={t("objectives:form.fields.statePensionStartAge")}>
            <input className="input" inputMode="numeric" onChange={(event) => update("statePensionStartAge", event.target.value)} value={form.statePensionStartAge} />
          </Field>
          </div>
        </section>

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} type="button">{t("common:actions.cancel")}</button>
          <button className="btn-primary" disabled={saving} type="submit">{saving ? t("common:states.preparing") : t("common:actions.save")}</button>
        </div>
      </form>
    </div>
  );
}
