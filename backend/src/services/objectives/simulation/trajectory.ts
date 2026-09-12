import type { ObjectiveInput } from "@pea/shared";
import { shouldApplyMonthlySavings, withdrawalForMonth } from "../objective-capital-math.js";

export interface TrajectoryParams {
  input: ObjectiveInput;
  currentAge: number;
  startCapital: number;
  monthlySavings: number;
  maxMonths: number;
  /** Capital requis mois par mois: sert a detecter le moment ou l'objectif est atteint. */
  thresholdByMonth: number[];
  /** Rendement du mois courant, appele une seule fois par mois simule. */
  nextMonthlyReturn: () => number;
}

export interface TrajectoryResult {
  capitals: number[];
  savings: number[];
  reachedMonth?: number;
  reachedTarget?: number;
}

/**
 * Deroule une trajectoire de capital mois par mois: capitalisation, epargne,
 * retraits de la rente une fois l'objectif atteint, puis plancher a zero.
 */
export function runTrajectory(params: TrajectoryParams): TrajectoryResult {
  const { input, currentAge, maxMonths, thresholdByMonth } = params;
  const capitals = new Array<number>(maxMonths + 1).fill(0);
  const savings = new Array<number>(maxMonths + 1).fill(0);
  let capital = params.startCapital;
  let annuityStartAge: number | undefined;
  let reachedMonth: number | undefined;
  let reachedTarget: number | undefined;

  for (let month = 0; month <= maxMonths; month += 1) {
    const age = currentAge + month / 12;
    const monthSavings = shouldApplyMonthlySavings(input, annuityStartAge) ? params.monthlySavings : 0;
    if (month > 0) {
      capital = capital * (1 + params.nextMonthlyReturn()) + monthSavings;
      capital -= withdrawalForMonth(input, age, annuityStartAge);
      if (input.type === "annuity_preserve_capital" && reachedTarget !== undefined) {
        capital = Math.max(capital, reachedTarget);
      }
      capital = Math.max(0, capital);
      savings[month] = monthSavings;
    }
    const threshold = thresholdByMonth[month] ?? 0;
    if (reachedMonth === undefined && capital >= threshold) {
      reachedMonth = month;
      annuityStartAge = age;
      reachedTarget = threshold;
    }
    capitals[month] = capital;
  }

  return { capitals, savings, reachedMonth, reachedTarget };
}
