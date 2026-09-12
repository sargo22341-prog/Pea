import type { ObjectiveDto, ObjectiveType } from "@pea/shared";
import type React from "react";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../lib/api";
import { ObjectiveAssumptionsSection } from "./form/ObjectiveAssumptionsSection";
import { Field } from "./form/ObjectiveFormControls";
import { ObjectiveSimulationSection } from "./form/ObjectiveSimulationSection";
import { ObjectiveTargetSection } from "./form/ObjectiveTargetSection";
import {
  clearHiddenObjectiveFields,
  objectiveFormFromDto,
  objectiveInputFromForm,
  type ObjectiveFormState,
  type ObjectiveFormUpdate
} from "./form/objectiveFormState";
import { objectiveTypes } from "./objectiveFormConfig";

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
  const [form, setForm] = useState(() => objectiveFormFromDto(objective));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedType = useMemo(() => objectiveTypes.find((type) => type.value === form.type), [form.type]);
  const update: ObjectiveFormUpdate = (key, value) => setForm((current: ObjectiveFormState) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.updateObjective(userId, objective.id, objectiveInputFromForm(form));
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
            <select
              className="input"
              onChange={(event) => setForm((current) => clearHiddenObjectiveFields(current, event.target.value as ObjectiveType))}
              value={form.type}
            >
              {objectiveTypes.map((type) => <option key={type.value} value={type.value}>{t(`objectives:${type.labelKey}`)}</option>)}
            </select>
          </Field>
        </div>
        <ObjectiveTargetSection form={form} update={update} />
        <ObjectiveAssumptionsSection form={form} update={update} />
        <ObjectiveSimulationSection form={form} update={update} />
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} type="button">{t("common:actions.cancel")}</button>
          <button className="btn-primary" disabled={saving} type="submit">{saving ? t("common:states.preparing") : t("common:actions.save")}</button>
        </div>
      </form>
    </div>
  );
}
