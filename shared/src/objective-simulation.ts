export type ObjectiveSimulationMode = "deterministic" | "stochastic" | "shocks" | "monte_carlo";

export const OBJECTIVE_SIMULATION_MODES = [
  "deterministic",
  "stochastic",
  "shocks",
  "monte_carlo"
] as const satisfies readonly ObjectiveSimulationMode[];

/** Valeurs par defaut partagees entre le formulaire, la validation et le calcul. */
export const OBJECTIVE_SIMULATION_DEFAULTS = {
  mode: "deterministic" as ObjectiveSimulationMode,
  /** Volatilite annuelle en % appliquee aux rendements mensuels. */
  annualVolatility: 15,
  /** Nombre moyen d'annees entre deux chocs de marche. */
  shockFrequencyYears: 8,
  /** Baisse moyenne en % provoquee par un choc. */
  shockSeverity: 30,
  /** Graine du generateur pseudo-aleatoire: garantit une courbe stable entre deux recalculs. */
  seed: 1
} as const;

export const OBJECTIVE_SIMULATION_LIMITS = {
  volatility: { min: 0, max: 100 },
  shockFrequencyYears: { min: 1, max: 50 },
  shockSeverity: { min: 1, max: 90 },
  seed: { min: 0, max: 2_147_483_647 }
} as const;

export function objectiveSimulationUsesVolatility(mode: ObjectiveSimulationMode) {
  return mode === "stochastic" || mode === "monte_carlo";
}

export function objectiveSimulationUsesShocks(mode: ObjectiveSimulationMode) {
  return mode === "shocks" || mode === "monte_carlo";
}

export function objectiveSimulationIsRandom(mode: ObjectiveSimulationMode) {
  return mode !== "deterministic";
}

export function objectiveSimulationHasRange(mode: ObjectiveSimulationMode) {
  return mode === "monte_carlo";
}
