import type { ObjectiveAssumptions, ObjectiveConfig, ObjectiveInput } from "@pea/shared";

export const defaultProjectionEndAge = 90;
const minProjectionEndAge = 70;
const maxProjectionEndAge = 120;
const defaultWithdrawalRate = 4;
const minWithdrawalRate = 0.001;
const scenarioReturnDelta = 2;

export function annualReturn(assumptions: ObjectiveAssumptions) {
  const scenarioDelta = assumptions.scenario === "prudent"
    ? -scenarioReturnDelta
    : assumptions.scenario === "optimistic" ? scenarioReturnDelta : 0;
  const gross = assumptions.annualReturnRate + scenarioDelta;
  const afterTax = gross * (1 - assumptions.taxRate / 100);
  return afterTax / 100;
}

export function monthlyReturn(assumptions: ObjectiveAssumptions) {
  return Math.pow(1 + annualReturn(assumptions), 1 / 12) - 1;
}

export function withdrawalRate(assumptions: ObjectiveAssumptions) {
  return Math.max(minWithdrawalRate, (assumptions.withdrawalRate ?? defaultWithdrawalRate) / 100);
}

export function projectionEndAge(assumptions: ObjectiveAssumptions) {
  return Math.min(maxProjectionEndAge, Math.max(minProjectionEndAge, assumptions.projectionEndAge ?? defaultProjectionEndAge));
}

export function monthsBetweenAges(currentAge: number, targetAge?: number) {
  if (targetAge === undefined) return undefined;
  return Math.max(0, Math.round((targetAge - currentAge) * 12));
}

export function isAnnuityObjective(input: ObjectiveInput) {
  return input.type !== "fixed_capital";
}

export function monthlyIncomeAtAge(input: ObjectiveInput, age: number) {
  const yearsFromCurrent = Math.max(0, age - (input.assumptions.currentAge ?? age));
  const indexation = input.config.indexIncomeToInflation
    ? Math.pow(1 + input.assumptions.inflationRate / 100, yearsFromCurrent)
    : 1;
  return (input.config.monthlyIncome ?? 0) * indexation;
}

export function netPortfolioIncomeAtAge(input: ObjectiveInput, age: number) {
  const pension = age >= input.assumptions.statePensionStartAge ? input.assumptions.statePensionMonthly : 0;
  return Math.max(0, monthlyIncomeAtAge(input, age) - pension);
}

/** Capital necessaire, a un age donne, pour servir la rente demandee jusqu'a la fin de projection. */
export function capitalNeededForObjectiveAnnuity(input: ObjectiveInput, startAge: number, monthlyRateValue: number) {
  const config = input.config;
  const endAge = projectionEndAge(input.assumptions);
  const months = Math.max(1, Math.round((endAge - startAge) * 12));
  let required = (config.finalCapitalTarget ?? 0) / Math.pow(1 + monthlyRateValue, months);
  for (let month = 1; month <= months; month += 1) {
    const age = startAge + month / 12;
    const inflationFactor = config.indexIncomeToInflation
      ? Math.pow(1 + input.assumptions.inflationRate / 100, month / 12)
      : 1;
    const pension = age >= input.assumptions.statePensionStartAge ? input.assumptions.statePensionMonthly : 0;
    const payment = Math.max(0, (config.monthlyIncome ?? 0) * inflationFactor - pension);
    required += payment / Math.pow(1 + monthlyRateValue, month);
  }
  return required;
}

/** Capital cible de l'objectif a un age donne, quel que soit son type. */
export function targetCapitalAtAge(input: ObjectiveInput, age: number, monthlyRateValue: number) {
  if (input.type === "fixed_capital") return input.config.targetAmount ?? 0;
  if (input.type === "annuity_preserve_capital") {
    return netPortfolioIncomeAtAge(input, age) * 12 / withdrawalRate(input.assumptions);
  }
  return capitalNeededForObjectiveAnnuity(input, age, monthlyRateValue);
}

/** Trajectoire cible affichee pour un capital fixe: progression lineaire jusqu'a l'age cible. */
export function buildObjectiveLine(
  config: ObjectiveConfig,
  assumptions: ObjectiveAssumptions,
  months: number,
  startCapital: number,
  targetCapital: number
): number[] {
  const currentAge = assumptions.currentAge ?? 0;
  const targetMonths = monthsBetweenAges(currentAge, config.targetAge) ?? months;
  return Array.from({ length: months + 1 }, (_, month) => {
    const ratio = targetMonths <= 0 ? 1 : Math.min(1, month / targetMonths);
    return startCapital + (targetCapital - startCapital) * ratio;
  });
}

export function shouldApplyMonthlySavings(input: ObjectiveInput, effectiveAnnuityStartAge: number | undefined) {
  if (input.type === "fixed_capital") return true;
  if (input.config.continueSavingsAfterAnnuityStart) return true;
  return effectiveAnnuityStartAge === undefined;
}

export function withdrawalForMonth(input: ObjectiveInput, age: number, annuityStartAge?: number) {
  if (age < (annuityStartAge ?? Number.POSITIVE_INFINITY) || !input.config.monthlyIncome) return 0;
  if (input.type === "annuity_preserve_capital") return 0;
  if (age > projectionEndAge(input.assumptions)) return 0;
  return netPortfolioIncomeAtAge(input, age);
}

/** Rente mensuelle que le capital pourrait servir a cet age, retraite d'Etat comprise. */
export function possibleMonthlyIncome(input: ObjectiveInput, capital: number, age: number, monthlyRateValue: number) {
  if (!isAnnuityObjective(input)) return undefined;
  const pension = age >= input.assumptions.statePensionStartAge ? input.assumptions.statePensionMonthly : 0;
  if (input.type === "annuity_consuming_capital") {
    const months = Math.max(1, Math.round((projectionEndAge(input.assumptions) - age) * 12));
    const protectedCapital = input.config.finalCapitalTarget ?? 0;
    const spendableCapital = Math.max(0, capital - protectedCapital / Math.pow(1 + monthlyRateValue, months));
    const portfolioIncome = monthlyRateValue === 0
      ? spendableCapital / months
      : spendableCapital * monthlyRateValue / (1 - Math.pow(1 + monthlyRateValue, -months));
    return portfolioIncome + pension;
  }
  const protectedCapital = input.type === "annuity_target_final_capital" ? input.config.finalCapitalTarget ?? 0 : 0;
  return Math.max(0, (capital - protectedCapital) * withdrawalRate(input.assumptions) / 12) + pension;
}
