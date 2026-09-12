import {
  OBJECTIVE_SIMULATION_DEFAULTS,
  OBJECTIVE_SIMULATION_LIMITS,
  type ObjectiveDto,
  type ObjectiveInput,
  type ObjectiveSimulationMode,
  type ObjectiveType
} from "@pea/shared";
import { objectiveFieldsByType, usesProjectionEndAge, usesWithdrawalRate, type ObjectiveSpecificField } from "../objectiveFormConfig";

export interface ObjectiveFormState {
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
  simulationMode: ObjectiveSimulationMode;
  simulationVolatility: string;
  simulationShockFrequency: string;
  simulationShockSeverity: string;
  simulationSeed: string;
}

/** Met a jour un champ du formulaire objectif. */
export type ObjectiveFormUpdate = <K extends keyof ObjectiveFormState>(key: K, value: ObjectiveFormState[K]) => void;

export function numberValue(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Nouvelle graine aleatoire: change le tirage tout en gardant une courbe stable ensuite. */
export function drawSimulationSeed() {
  return Math.floor(Math.random() * OBJECTIVE_SIMULATION_LIMITS.seed.max);
}

export function objectiveFormFromDto(objective: ObjectiveDto): ObjectiveFormState {
  const assumptions = objective.assumptions;
  const defaults = OBJECTIVE_SIMULATION_DEFAULTS;
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
    currentAge: assumptions.currentAge?.toString() ?? "",
    futureMonthlySavings: assumptions.futureMonthlySavings?.toString() ?? "",
    inflationRate: assumptions.inflationRate.toString(),
    annualReturnRate: assumptions.annualReturnRate.toString(),
    taxRate: assumptions.taxRate.toString(),
    withdrawalRate: (assumptions.withdrawalRate ?? 4).toString(),
    projectionEndAge: (assumptions.projectionEndAge ?? 90).toString(),
    statePensionMonthly: assumptions.statePensionMonthly.toString(),
    statePensionStartAge: assumptions.statePensionStartAge.toString(),
    scenario: assumptions.scenario,
    simulationMode: assumptions.simulationMode ?? defaults.mode,
    simulationVolatility: (assumptions.simulationVolatility ?? defaults.annualVolatility).toString(),
    simulationShockFrequency: (assumptions.simulationShockFrequency ?? defaults.shockFrequencyYears).toString(),
    simulationShockSeverity: (assumptions.simulationShockSeverity ?? defaults.shockSeverity).toString(),
    simulationSeed: (assumptions.simulationSeed ?? defaults.seed).toString()
  };
}

export function objectiveInputFromForm(form: ObjectiveFormState): ObjectiveInput {
  const visible = new Set<ObjectiveSpecificField>(objectiveFieldsByType[form.type]);
  const include = (field: ObjectiveSpecificField) => visible.has(field);
  const defaults = OBJECTIVE_SIMULATION_DEFAULTS;

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
      scenario: form.scenario,
      simulationMode: form.simulationMode,
      simulationVolatility: numberValue(form.simulationVolatility) ?? defaults.annualVolatility,
      simulationShockFrequency: numberValue(form.simulationShockFrequency) ?? defaults.shockFrequencyYears,
      simulationShockSeverity: numberValue(form.simulationShockSeverity) ?? defaults.shockSeverity,
      simulationSeed: numberValue(form.simulationSeed) ?? defaults.seed
    }
  };
}

/** Vide les champs propres a un autre type d'objectif avant enregistrement. */
export function clearHiddenObjectiveFields(form: ObjectiveFormState, type: ObjectiveType): ObjectiveFormState {
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
