import type { ObjectiveInput, ObjectiveMissingData } from "@pea/shared";

/** Champs indispensables au calcul de la projection, selon le type d'objectif. */
export function requiredObjectiveFields(input: ObjectiveInput): ObjectiveMissingData[] {
  const config = input.config;
  const items: ObjectiveMissingData[] = [];
  const need = (condition: boolean, field: string, label: string) => {
    if (condition) items.push({ field, label });
  };
  if (input.type === "fixed_capital") {
    need(!config.targetAmount, "config.targetAmount", "Montant cible");
    need(!config.targetAge, "config.targetAge", "Age cible");
  }
  if (input.type !== "fixed_capital") {
    need(!config.monthlyIncome, "config.monthlyIncome", "Rente mensuelle voulue");
  }
  if (input.type === "annuity_target_final_capital") {
    need(config.finalCapitalTarget === undefined, "config.finalCapitalTarget", "Capital final voulu");
  }
  return items;
}
