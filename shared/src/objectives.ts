import type { ObjectiveSimulationMode } from "./objective-simulation.js";

export type ObjectiveType =
  | "fixed_capital"
  | "annuity_consuming_capital"
  | "annuity_preserve_capital"
  | "annuity_target_final_capital";

export type ObjectiveScenario = "prudent" | "normal" | "optimistic";

export interface ObjectiveAssumptions {
  currentAge?: number | undefined;
  futureMonthlySavings?: number | null | undefined;
  inflationRate: number;
  annualReturnRate: number;
  taxRate: number;
  withdrawalRate?: number | undefined;
  projectionEndAge?: number | undefined;
  statePensionMonthly: number;
  statePensionStartAge: number;
  scenario: ObjectiveScenario;
  /** Forme de la courbe de projection: lisse, volatile, avec chocs ou Monte-Carlo. */
  simulationMode?: ObjectiveSimulationMode | undefined;
  /** Volatilite annuelle en % (modes stochastique et Monte-Carlo). */
  simulationVolatility?: number;
  /** Nombre moyen d'annees entre deux chocs (modes chocs et Monte-Carlo). */
  simulationShockFrequency?: number;
  /** Baisse moyenne en % d'un choc (modes chocs et Monte-Carlo). */
  simulationShockSeverity?: number;
  /** Graine du tirage aleatoire, pour une courbe reproductible entre deux recalculs. */
  simulationSeed?: number;
}

export interface ObjectiveConfig {
  targetAmount?: number | undefined;
  targetAge?: number | undefined;
  monthlyIncome?: number | undefined;
  indexIncomeToInflation?: boolean | undefined;
  continueSavingsAfterAnnuityStart?: boolean | undefined;
  finalCapitalTarget?: number | undefined;
}

export interface ObjectiveInput {
  title: string;
  type: ObjectiveType;
  active?: boolean;
  config: ObjectiveConfig;
  assumptions: ObjectiveAssumptions;
}

export interface ObjectiveSummary {
  currentCapital: number;
  targetCapital?: number;
  reachedAge?: number | undefined;
  reachedDate?: string | undefined;
  leadLagMonths?: number | undefined;
  progressPercent: number;
  message: string;
  /** Part des trajectoires Monte-Carlo qui atteignent l'objectif, en %. */
  successProbability?: number | undefined;
}

export interface ObjectiveSeriesPoint {
  date: string;
  age: number;
  real?: number;
  projected?: number;
  /** Borne basse (10e centile) de l'intervalle Monte-Carlo. */
  projectedLow?: number | undefined;
  /** Borne haute (90e centile) de l'intervalle Monte-Carlo. */
  projectedHigh?: number | undefined;
  objective?: number;
  possibleMonthlyIncome?: number | undefined;
  paidMonthlyIncome?: number | undefined;
}

export interface ObjectiveContributionPoint {
  month: string;
  amount: number;
  kind: "real" | "estimated";
}

export interface ObjectiveMissingData {
  field: string;
  label: string;
}

export interface ObjectiveProjection {
  status: "ready" | "missing_data";
  missingData: ObjectiveMissingData[];
  summary?: ObjectiveSummary;
  series: ObjectiveSeriesPoint[];
  contributions: ObjectiveContributionPoint[];
  lastUpdatedAt?: string | undefined;
  nextUpdateAt?: string | undefined;
}

export interface ObjectiveDto extends ObjectiveInput {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  projection: ObjectiveProjection;
}

export interface ObjectiveListDto {
  objectives: ObjectiveDto[];
}
