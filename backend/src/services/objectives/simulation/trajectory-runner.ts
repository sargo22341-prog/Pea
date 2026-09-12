import { objectiveSimulationHasRange } from "@pea/shared";
import { percentilesByMonth } from "./percentiles.js";
import { createMonthlyReturnPath } from "./return-path.js";
import { createSeededRandom } from "./seeded-random.js";
import {
  monteCarloHighPercentile,
  monteCarloLowPercentile,
  monteCarloMedianPercentile,
  settingsAreRandom,
  type SimulationSettings
} from "./simulation-settings.js";
import { runTrajectory, type TrajectoryParams, type TrajectoryResult } from "./trajectory.js";

export interface SimulationOutcome {
  capitals: number[];
  savings: number[];
  /** Bornes de l'intervalle de confiance, uniquement en mode Monte-Carlo. */
  lowCapitals?: number[];
  highCapitals?: number[];
  reachedMonth?: number;
  reachedTarget?: number;
  /** Part des trajectoires atteignant l'objectif, en % (mode Monte-Carlo). */
  successProbability?: number;
}

export type SimulationRunParams = Omit<TrajectoryParams, "nextMonthlyReturn">;

function firstReachedMonth(capitals: number[], thresholdByMonth: number[]) {
  for (let month = 0; month < capitals.length; month += 1) {
    if (capitals[month]! >= (thresholdByMonth[month] ?? 0)) return month;
  }
  return undefined;
}

function runOnce(params: SimulationRunParams, settings: SimulationSettings, baseMonthlyReturn: number, seed: number): TrajectoryResult {
  const random = createSeededRandom(seed);
  const nextMonthlyReturn = settingsAreRandom(settings)
    ? createMonthlyReturnPath(baseMonthlyReturn, settings, random)
    : () => baseMonthlyReturn;
  return runTrajectory({ ...params, nextMonthlyReturn });
}

/**
 * Lance la ou les trajectoires demandees par le mode de simulation.
 * Monte-Carlo agrege les trajectoires en mediane et intervalle 10 %-90 %;
 * les autres modes renvoient la trajectoire unique simulee.
 */
export function runSimulation(params: SimulationRunParams, settings: SimulationSettings, baseMonthlyReturn: number): SimulationOutcome {
  if (!objectiveSimulationHasRange(settings.mode) || !settingsAreRandom(settings)) {
    const trajectory = runOnce(params, settings, baseMonthlyReturn, settings.seed);
    return {
      capitals: trajectory.capitals,
      savings: trajectory.savings,
      reachedMonth: trajectory.reachedMonth,
      reachedTarget: trajectory.reachedTarget
    };
  }

  const trajectories: TrajectoryResult[] = [];
  for (let index = 0; index < settings.trajectoryCount; index += 1) {
    trajectories.push(runOnce(params, settings, baseMonthlyReturn, settings.seed + index));
  }
  const [lowCapitals, capitals, highCapitals] = percentilesByMonth(
    trajectories.map((trajectory) => trajectory.capitals),
    [monteCarloLowPercentile, monteCarloMedianPercentile, monteCarloHighPercentile]
  );
  const [savings] = percentilesByMonth(trajectories.map((trajectory) => trajectory.savings), [monteCarloMedianPercentile]);
  const reachedCount = trajectories.filter((trajectory) => trajectory.reachedMonth !== undefined).length;
  const medianCapitals = capitals!;
  const reachedMonth = firstReachedMonth(medianCapitals, params.thresholdByMonth);
  return {
    capitals: medianCapitals,
    savings: savings!,
    lowCapitals,
    highCapitals,
    reachedMonth,
    reachedTarget: reachedMonth === undefined ? undefined : params.thresholdByMonth[reachedMonth],
    successProbability: Math.round((reachedCount / trajectories.length) * 1000) / 10
  };
}
