import type {
  ObjectiveContributionPoint,
  ObjectiveInput,
  ObjectiveMissingData,
  ObjectiveProjection,
  ObjectiveSeriesPoint,
  ObjectiveSummary
} from "@pea/shared";
import {
  buildObjectiveLine,
  isAnnuityObjective,
  monthlyIncomeAtAge,
  monthlyReturn,
  monthsBetweenAges,
  possibleMonthlyIncome,
  projectionEndAge,
  targetCapitalAtAge
} from "./objective-capital-math.js";
import type { ObjectivePortfolioSnapshot } from "./objective-portfolio.service.js";
import { resolveSimulationSettings } from "./simulation/simulation-settings.js";
import { runSimulation } from "./simulation/trajectory-runner.js";
import { requiredObjectiveFields } from "./objective-required-fields.js";

const minProjectionMonths = 12;
const estimatedContributionMonths = 12;
const projectionRefreshHour = 23;

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function nextUpdateAt(now: Date) {
  const next = new Date(now);
  next.setHours(projectionRefreshHour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

export class ObjectiveCalculatorService {
  calculate(input: ObjectiveInput, portfolio: ObjectivePortfolioSnapshot, now = new Date()): ObjectiveProjection {
    const missingData: ObjectiveMissingData[] = requiredObjectiveFields(input);
    const currentAge = input.assumptions.currentAge;
    if (currentAge === undefined) missingData.unshift({ field: "assumptions.currentAge", label: "Age actuel" });
    if (missingData.length || currentAge === undefined) {
      return {
        status: "missing_data",
        missingData,
        series: portfolio.realSeries,
        contributions: portfolio.contributions,
        lastUpdatedAt: now.toISOString(),
        nextUpdateAt: nextUpdateAt(now)
      };
    }

    return {
      status: "ready",
      missingData: [],
      ...this.project(input, portfolio, now, currentAge),
      lastUpdatedAt: now.toISOString(),
      nextUpdateAt: nextUpdateAt(now)
    };
  }

  private project(
    input: ObjectiveInput,
    portfolio: ObjectivePortfolioSnapshot,
    now: Date,
    currentAge: number
  ): Pick<ObjectiveProjection, "summary" | "series" | "contributions"> {
    const config = input.config;
    const assumptions = input.assumptions;
    const baseMonthlyReturn = monthlyReturn(assumptions);
    const endAge = projectionEndAge(assumptions);
    const maxMonths = Math.max(minProjectionMonths, Math.round(((config.targetAge ?? endAge) - currentAge) * 12));
    const monthlySavings = assumptions.futureMonthlySavings ?? portfolio.averageMonthlySavings;
    const annuity = isAnnuityObjective(input);
    const initialTargetCapital = targetCapitalAtAge(input, currentAge, baseMonthlyReturn);
    const thresholdByMonth = annuity
      ? Array.from({ length: maxMonths + 1 }, (_, month) => targetCapitalAtAge(input, currentAge + month / 12, baseMonthlyReturn))
      : new Array<number>(maxMonths + 1).fill(initialTargetCapital);
    const objectiveLine = annuity
      ? thresholdByMonth
      : buildObjectiveLine(config, assumptions, maxMonths, portfolio.currentCapital, initialTargetCapital);

    const outcome = runSimulation(
      {
        input,
        currentAge,
        startCapital: portfolio.currentCapital,
        monthlySavings,
        maxMonths,
        thresholdByMonth
      },
      resolveSimulationSettings(assumptions),
      baseMonthlyReturn
    );

    const series: ObjectiveSeriesPoint[] = [...portfolio.realSeries];
    const contributions: ObjectiveContributionPoint[] = [...portfolio.contributions];
    for (let month = 0; month <= maxMonths; month += 1) {
      const age = currentAge + month / 12;
      const capital = outcome.capitals[month] ?? 0;
      const date = addMonths(now, month).toISOString();
      series.push({
        date,
        age,
        projected: capital,
        projectedLow: outcome.lowCapitals?.[month],
        projectedHigh: outcome.highCapitals?.[month],
        objective: objectiveLine[month] ?? initialTargetCapital,
        possibleMonthlyIncome: possibleMonthlyIncome(input, capital, age, baseMonthlyReturn),
        paidMonthlyIncome: annuity && outcome.reachedMonth !== undefined && month >= outcome.reachedMonth
          ? monthlyIncomeAtAge(input, age)
          : undefined
      });
      if (month > 0 && month <= estimatedContributionMonths) {
        contributions.push({ month: date.slice(0, 7), amount: outcome.savings[month] ?? 0, kind: "estimated" });
      }
    }

    return {
      summary: this.summary(input, portfolio, currentAge, maxMonths, now, outcome, initialTargetCapital),
      series,
      contributions
    };
  }

  private summary(
    input: ObjectiveInput,
    portfolio: ObjectivePortfolioSnapshot,
    currentAge: number,
    maxMonths: number,
    now: Date,
    outcome: ReturnType<typeof runSimulation>,
    initialTargetCapital: number
  ): ObjectiveSummary {
    const targetCapital = outcome.reachedTarget ?? initialTargetCapital;
    const targetMonth = monthsBetweenAges(currentAge, input.config.targetAge) ?? maxMonths;
    const reachedMonth = outcome.reachedMonth;
    const progressPercent = targetCapital > 0
      ? Math.min(100, Math.round((portfolio.currentCapital / targetCapital) * 1000) / 10)
      : 100;
    return {
      currentCapital: portfolio.currentCapital,
      targetCapital,
      reachedAge: reachedMonth === undefined ? undefined : currentAge + reachedMonth / 12,
      reachedDate: reachedMonth === undefined ? undefined : addMonths(now, reachedMonth).toISOString(),
      leadLagMonths: reachedMonth === undefined ? undefined : targetMonth - reachedMonth,
      progressPercent,
      successProbability: outcome.successProbability,
      message: reachedMonth === undefined
        ? "objectives.summaryMessage.unreachable"
        : "objectives.summaryMessage.reachable"
    };
  }
}

export const objectiveCalculatorService = new ObjectiveCalculatorService();
