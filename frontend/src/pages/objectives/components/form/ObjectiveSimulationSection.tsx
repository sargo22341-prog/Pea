import {
  OBJECTIVE_SIMULATION_LIMITS,
  OBJECTIVE_SIMULATION_MODES,
  objectiveSimulationIsRandom,
  objectiveSimulationUsesShocks,
  objectiveSimulationUsesVolatility,
  type ObjectiveSimulationMode
} from "@pea/shared";
import { Dices } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Field, FormSection } from "./ObjectiveFormControls";
import { drawSimulationSeed, type ObjectiveFormState, type ObjectiveFormUpdate } from "./objectiveFormState";

const limits = OBJECTIVE_SIMULATION_LIMITS;

export function ObjectiveSimulationSection({ form, update }: { form: ObjectiveFormState; update: ObjectiveFormUpdate }) {
  const { t } = useTranslation("objectives");
  const mode = form.simulationMode;

  return (
    <FormSection title={t("form.simulationSection")}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("form.fields.simulationMode")}>
          <select
            className="input"
            onChange={(event) => update("simulationMode", event.target.value as ObjectiveSimulationMode)}
            value={mode}
          >
            {OBJECTIVE_SIMULATION_MODES.map((value) => (
              <option key={value} value={value}>{t(`form.simulationModes.${value}`)}</option>
            ))}
          </select>
        </Field>
        <p className="self-end rounded-md border border-line bg-ink p-3 text-xs text-slate-300">
          {t(`form.simulationModeHelp.${mode}`)}
        </p>
        {objectiveSimulationUsesVolatility(mode) ? (
          <Field label={t("form.fields.simulationVolatility")}>
            <input
              className="input"
              inputMode="decimal"
              max={limits.volatility.max}
              min={limits.volatility.min}
              onChange={(event) => update("simulationVolatility", event.target.value)}
              type="number"
              value={form.simulationVolatility}
            />
          </Field>
        ) : null}
        {objectiveSimulationUsesShocks(mode) ? (
          <>
            <Field label={t("form.fields.simulationShockFrequency")}>
              <input
                className="input"
                inputMode="numeric"
                max={limits.shockFrequencyYears.max}
                min={limits.shockFrequencyYears.min}
                onChange={(event) => update("simulationShockFrequency", event.target.value)}
                type="number"
                value={form.simulationShockFrequency}
              />
            </Field>
            <Field label={t("form.fields.simulationShockSeverity")}>
              <input
                className="input"
                inputMode="decimal"
                max={limits.shockSeverity.max}
                min={limits.shockSeverity.min}
                onChange={(event) => update("simulationShockSeverity", event.target.value)}
                type="number"
                value={form.simulationShockSeverity}
              />
            </Field>
          </>
        ) : null}
        {objectiveSimulationIsRandom(mode) ? (
          <div className="md:col-span-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="grow">
                <Field label={t("form.fields.simulationSeed")}>
                  <input
                    className="input"
                    inputMode="numeric"
                    max={limits.seed.max}
                    min={limits.seed.min}
                    onChange={(event) => update("simulationSeed", event.target.value)}
                    type="number"
                    value={form.simulationSeed}
                  />
                </Field>
              </div>
              <button
                className="btn-ghost shrink-0"
                onClick={() => update("simulationSeed", drawSimulationSeed().toString())}
                type="button"
              >
                <Dices size={16} />
                {t("form.fields.simulationNewDraw")}
              </button>
            </div>
            <p className="muted mt-2 text-xs">{t("form.fields.simulationSeedHelp")}</p>
          </div>
        ) : null}
      </div>
    </FormSection>
  );
}
