import {
  OBJECTIVE_SIMULATION_DEFAULTS,
  OBJECTIVE_SIMULATION_LIMITS,
  objectiveSimulationHasRange,
  objectiveSimulationIsRandom,
  objectiveSimulationUsesShocks,
  objectiveSimulationUsesVolatility,
  type ObjectiveAssumptions,
  type ObjectiveSimulationMode
} from "@pea/shared";

/** Nombre de trajectoires simulees en mode Monte-Carlo. */
export const monteCarloTrajectoryCount = 300;
/** Centiles utilises pour l'intervalle affiche autour de la mediane. */
export const monteCarloLowPercentile = 10;
export const monteCarloMedianPercentile = 50;
export const monteCarloHighPercentile = 90;

export interface SimulationSettings {
  mode: ObjectiveSimulationMode;
  /** Volatilite annuelle exprimee en fraction (0.15 pour 15 %). */
  annualVolatility: number;
  shockFrequencyYears: number;
  /** Baisse moyenne d'un choc exprimee en fraction (0.3 pour 30 %). */
  shockSeverity: number;
  seed: number;
  trajectoryCount: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function numberOrDefault(value: number | undefined, fallback: number) {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

export function resolveSimulationSettings(assumptions: ObjectiveAssumptions): SimulationSettings {
  const mode = assumptions.simulationMode ?? OBJECTIVE_SIMULATION_DEFAULTS.mode;
  const limits = OBJECTIVE_SIMULATION_LIMITS;
  return {
    mode,
    annualVolatility: clamp(
      numberOrDefault(assumptions.simulationVolatility, OBJECTIVE_SIMULATION_DEFAULTS.annualVolatility),
      limits.volatility.min,
      limits.volatility.max
    ) / 100,
    shockFrequencyYears: clamp(
      numberOrDefault(assumptions.simulationShockFrequency, OBJECTIVE_SIMULATION_DEFAULTS.shockFrequencyYears),
      limits.shockFrequencyYears.min,
      limits.shockFrequencyYears.max
    ),
    shockSeverity: clamp(
      numberOrDefault(assumptions.simulationShockSeverity, OBJECTIVE_SIMULATION_DEFAULTS.shockSeverity),
      limits.shockSeverity.min,
      limits.shockSeverity.max
    ) / 100,
    seed: Math.trunc(clamp(numberOrDefault(assumptions.simulationSeed, OBJECTIVE_SIMULATION_DEFAULTS.seed), limits.seed.min, limits.seed.max)),
    trajectoryCount: objectiveSimulationHasRange(mode) ? monteCarloTrajectoryCount : 1
  };
}

export function settingsUseVolatility(settings: SimulationSettings) {
  return objectiveSimulationUsesVolatility(settings.mode) && settings.annualVolatility > 0;
}

export function settingsUseShocks(settings: SimulationSettings) {
  return objectiveSimulationUsesShocks(settings.mode);
}

export function settingsAreRandom(settings: SimulationSettings) {
  return objectiveSimulationIsRandom(settings.mode) && (settingsUseVolatility(settings) || settingsUseShocks(settings));
}
