import type { ObjectiveType } from "@pea/shared";

export const objectiveTypes: Array<{ value: ObjectiveType; labelKey: string }> = [
  { value: "fixed_capital", labelKey: "form.types.fixed_capital" },
  { value: "annuity_consuming_capital", labelKey: "form.types.annuity_consuming_capital" },
  { value: "annuity_preserve_capital", labelKey: "form.types.annuity_preserve_capital" },
  { value: "annuity_target_final_capital", labelKey: "form.types.annuity_target_final_capital" }
];

export type ObjectiveSpecificField =
  | "targetAmount"
  | "targetAge"
  | "monthlyIncome"
  | "indexIncomeToInflation"
  | "continueSavingsAfterAnnuityStart"
  | "finalCapitalTarget";

export const objectiveFieldsByType: Record<ObjectiveType, ObjectiveSpecificField[]> = {
  fixed_capital: ["targetAmount", "targetAge"],
  annuity_consuming_capital: ["monthlyIncome", "indexIncomeToInflation", "continueSavingsAfterAnnuityStart"],
  annuity_preserve_capital: ["monthlyIncome", "indexIncomeToInflation", "continueSavingsAfterAnnuityStart"],
  annuity_target_final_capital: ["monthlyIncome", "finalCapitalTarget", "indexIncomeToInflation", "continueSavingsAfterAnnuityStart"]
};

export function isObjectiveFieldVisible(type: ObjectiveType, field: ObjectiveSpecificField) {
  return objectiveFieldsByType[type].includes(field);
}

export function usesWithdrawalRate(type: ObjectiveType) {
  return ["annuity_preserve_capital", "annuity_target_final_capital"].includes(type);
}

export function usesProjectionEndAge(type: ObjectiveType) {
  return ["annuity_consuming_capital", "annuity_target_final_capital"].includes(type);
}
