export type ObjectiveType =
  | "fixed_capital"
  | "annuity_consuming_capital"
  | "annuity_preserve_capital"
  | "annuity_target_final_capital";

export type ObjectiveScenario = "prudent" | "normal" | "optimistic";

export interface ObjectiveAssumptions {
  currentAge?: number;
  futureMonthlySavings?: number | null;
  inflationRate: number;
  annualReturnRate: number;
  taxRate: number;
  withdrawalRate?: number;
  projectionEndAge?: number;
  statePensionMonthly: number;
  statePensionStartAge: number;
  scenario: ObjectiveScenario;
}

export interface ObjectiveConfig {
  targetAmount?: number;
  targetAge?: number;
  monthlyIncome?: number;
  indexIncomeToInflation?: boolean;
  continueSavingsAfterAnnuityStart?: boolean;
  finalCapitalTarget?: number;
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
  reachedAge?: number;
  reachedDate?: string;
  leadLagMonths?: number;
  progressPercent: number;
  message: string;
}

export interface ObjectiveSeriesPoint {
  date: string;
  age: number;
  real?: number;
  projected?: number;
  objective?: number;
  possibleMonthlyIncome?: number;
  paidMonthlyIncome?: number;
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
  lastUpdatedAt?: string;
  nextUpdateAt?: string;
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
