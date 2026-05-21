import type {
  ObjectiveAssumptions,
  ObjectiveConfig,
  ObjectiveContributionPoint,
  ObjectiveInput,
  ObjectiveMissingData,
  ObjectiveProjection,
  ObjectiveSeriesPoint
} from "@pea/shared";
import type { ObjectivePortfolioSnapshot } from "./objective-portfolio.service.js";

const defaultProjectionEndAge = 90;

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + Math.round(years * 12));
  return next;
}

function nextUpdateAt(now: Date) {
  const next = new Date(now);
  next.setHours(23, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

function missing(field: string, label: string): ObjectiveMissingData {
  return { field, label };
}

function annualReturn(assumptions: ObjectiveAssumptions) {
  const scenarioDelta = assumptions.scenario === "prudent" ? -2 : assumptions.scenario === "optimistic" ? 2 : 0;
  const gross = assumptions.annualReturnRate + scenarioDelta;
  const afterTax = gross * (1 - assumptions.taxRate / 100);
  return afterTax / 100;
}

function monthlyReturn(assumptions: ObjectiveAssumptions) {
  return Math.pow(1 + annualReturn(assumptions), 1 / 12) - 1;
}

function withdrawalRate(assumptions: ObjectiveAssumptions) {
  return Math.max(0.001, (assumptions.withdrawalRate ?? 4) / 100);
}

function projectionEndAge(assumptions: ObjectiveAssumptions) {
  return Math.min(120, Math.max(70, assumptions.projectionEndAge ?? defaultProjectionEndAge));
}

function monthsBetweenAges(currentAge: number, targetAge?: number) {
  if (targetAge === undefined) return undefined;
  return Math.max(0, Math.round((targetAge - currentAge) * 12));
}

function capitalNeededForAnnuity(input: {
  monthlyIncome: number;
  months: number;
  monthlyRate: number;
  inflationRate: number;
  indexed: boolean;
  finalCapital: number;
}) {
  let required = input.finalCapital / Math.pow(1 + input.monthlyRate, input.months);
  for (let month = 1; month <= input.months; month += 1) {
    const inflationFactor = input.indexed ? Math.pow(1 + input.inflationRate / 100, month / 12) : 1;
    const payment = input.monthlyIncome * inflationFactor;
    required += payment / Math.pow(1 + input.monthlyRate, month);
  }
  return required;
}

function capitalNeededForObjectiveAnnuity(input: ObjectiveInput, startAge: number, monthlyRateValue: number) {
  const config = input.config;
  const endAge = projectionEndAge(input.assumptions);
  const months = Math.max(1, Math.round((endAge - startAge) * 12));
  let required = (config.finalCapitalTarget ?? 0) / Math.pow(1 + monthlyRateValue, months);
  for (let month = 1; month <= months; month += 1) {
    const age = startAge + month / 12;
    const inflationFactor = config.indexIncomeToInflation ? Math.pow(1 + input.assumptions.inflationRate / 100, month / 12) : 1;
    const pension = age >= input.assumptions.statePensionStartAge ? input.assumptions.statePensionMonthly : 0;
    const payment = Math.max(0, (config.monthlyIncome ?? 0) * inflationFactor - pension);
    required += payment / Math.pow(1 + monthlyRateValue, month);
  }
  return required;
}

function monthlyIncomeAtAge(input: ObjectiveInput, age: number) {
  const yearsFromCurrent = Math.max(0, age - (input.assumptions.currentAge ?? age));
  return (input.config.monthlyIncome ?? 0) * (input.config.indexIncomeToInflation ? Math.pow(1 + input.assumptions.inflationRate / 100, yearsFromCurrent) : 1);
}

function netPortfolioIncomeAtAge(input: ObjectiveInput, age: number) {
  const pension = age >= input.assumptions.statePensionStartAge ? input.assumptions.statePensionMonthly : 0;
  return Math.max(0, monthlyIncomeAtAge(input, age) - pension);
}

function buildObjectiveLine(config: ObjectiveConfig, assumptions: ObjectiveAssumptions, months: number, startCapital: number, targetCapital: number): number[] {
  const currentAge = assumptions.currentAge ?? 0;
  const targetMonths = monthsBetweenAges(currentAge, config.targetAge) ?? months;
  return Array.from({ length: months + 1 }, (_, month) => {
    const ratio = targetMonths <= 0 ? 1 : Math.min(1, month / targetMonths);
    return startCapital + (targetCapital - startCapital) * ratio;
  });
}

function shouldApplyMonthlySavings(input: ObjectiveInput, effectiveAnnuityStartAge: number | undefined) {
  if (input.type === "fixed_capital") return true;
  if (input.config.continueSavingsAfterAnnuityStart) return true;
  return effectiveAnnuityStartAge === undefined;
}

function isAnnuityObjective(input: ObjectiveInput) {
  return input.type !== "fixed_capital";
}

export class ObjectiveCalculatorService {
  calculate(input: ObjectiveInput, portfolio: ObjectivePortfolioSnapshot, now = new Date()): ObjectiveProjection {
    const missingData = this.requiredFields(input);
    const currentAge = input.assumptions.currentAge;
    if (currentAge === undefined) missingData.unshift(missing("assumptions.currentAge", "Age actuel"));
    if (missingData.length) {
      return {
        status: "missing_data",
        missingData,
        series: portfolio.realSeries,
        contributions: portfolio.contributions,
        lastUpdatedAt: now.toISOString(),
        nextUpdateAt: nextUpdateAt(now)
      };
    }

    const projection = this.project(input, portfolio, now, currentAge!);
    return {
      status: "ready",
      missingData: [],
      ...projection,
      lastUpdatedAt: now.toISOString(),
      nextUpdateAt: nextUpdateAt(now)
    };
  }

  private requiredFields(input: ObjectiveInput): ObjectiveMissingData[] {
    const config = input.config;
    const items: ObjectiveMissingData[] = [];
    const need = (condition: boolean, field: string, label: string) => {
      if (condition) items.push(missing(field, label));
    };
    if (input.type === "fixed_capital") {
      need(!config.targetAmount, "config.targetAmount", "Montant cible");
      need(!config.targetAge, "config.targetAge", "Age cible");
    }
    if (input.type === "annuity_consuming_capital") {
      need(!config.monthlyIncome, "config.monthlyIncome", "Rente mensuelle voulue");
    }
    if (input.type === "annuity_preserve_capital") {
      need(!config.monthlyIncome, "config.monthlyIncome", "Rente mensuelle voulue");
    }
    if (input.type === "annuity_target_final_capital") {
      need(!config.monthlyIncome, "config.monthlyIncome", "Rente mensuelle voulue");
      need(config.finalCapitalTarget === undefined, "config.finalCapitalTarget", "Capital final voulu");
    }
    return items;
  }

  private project(input: ObjectiveInput, portfolio: ObjectivePortfolioSnapshot, now: Date, currentAge: number): Omit<ObjectiveProjection, "status" | "missingData" | "lastUpdatedAt" | "nextUpdateAt"> {
    const config = input.config;
    const assumptions = input.assumptions;
    const mRate = monthlyReturn(assumptions);
    const endAge = projectionEndAge(assumptions);
    const maxMonths = Math.max(12, Math.round(((config.targetAge ?? endAge) - currentAge) * 12));
    const monthlySavings = assumptions.futureMonthlySavings ?? portfolio.averageMonthlySavings;
    let targetCapital = this.targetCapital(input, currentAge, portfolio.currentCapital, mRate);
    const series: ObjectiveSeriesPoint[] = [...portfolio.realSeries];
    let capital = portfolio.currentCapital;
    let reachedMonth: number | undefined;
    let effectiveAnnuityStartAge: number | undefined;
    const inferAnnuityStart = input.type !== "fixed_capital";

    const objectiveValues = buildObjectiveLine(config, assumptions, maxMonths, portfolio.currentCapital, targetCapital);
    const contributions: ObjectiveContributionPoint[] = [...portfolio.contributions];
    for (let month = 0; month <= maxMonths; month += 1) {
      const age = currentAge + month / 12;
      const monthSavings = shouldApplyMonthlySavings(input, effectiveAnnuityStartAge) ? monthlySavings : 0;
      if (month > 0) {
        capital = capital * (1 + mRate) + monthSavings;
        capital -= this.withdrawalForMonth(input, age, month, effectiveAnnuityStartAge);
        if (input.type === "annuity_preserve_capital" && effectiveAnnuityStartAge !== undefined) {
          capital = Math.max(capital, targetCapital);
        }
        capital = Math.max(0, capital);
      }
      const monthTargetCapital = inferAnnuityStart ? this.targetCapitalForAge(input, age, mRate) : targetCapital;
      if (reachedMonth === undefined && capital >= monthTargetCapital) {
        reachedMonth = month;
        effectiveAnnuityStartAge = age;
        targetCapital = monthTargetCapital;
      }
      const date = addYears(now, month / 12).toISOString();
      const paidMonthlyIncome = isAnnuityObjective(input) && effectiveAnnuityStartAge !== undefined && age >= effectiveAnnuityStartAge
        ? monthlyIncomeAtAge(input, age)
        : undefined;
      series.push({
        date,
        age,
        projected: capital,
        objective: inferAnnuityStart ? monthTargetCapital : objectiveValues[month] ?? targetCapital,
        possibleMonthlyIncome: this.possibleMonthlyIncome(input, capital, age, mRate),
        paidMonthlyIncome
      });
      if (month > 0 && month <= 12) {
        contributions.push({ month: date.slice(0, 7), amount: monthSavings, kind: "estimated" });
      }
    }

    const targetMonth = monthsBetweenAges(currentAge, config.targetAge) ?? maxMonths;
    const leadLagMonths = reachedMonth === undefined ? undefined : targetMonth - reachedMonth;
    const reachedAge = reachedMonth === undefined ? undefined : currentAge + reachedMonth / 12;
    const reachedDate = reachedMonth === undefined ? undefined : addYears(now, reachedMonth / 12).toISOString();
    const progressPercent = targetCapital > 0 ? Math.min(100, Math.round((portfolio.currentCapital / targetCapital) * 1000) / 10) : 100;
    return {
      summary: {
        currentCapital: portfolio.currentCapital,
        targetCapital,
        reachedAge,
        reachedDate,
        leadLagMonths,
        progressPercent,
        message: reachedAge
          ? "objectives.summaryMessage.reachable"
          : "objectives.summaryMessage.unreachable"
      },
      series,
      contributions
    };
  }

  private targetCapital(input: ObjectiveInput, currentAge: number, currentCapital: number, monthlyRateValue: number) {
    const config = input.config;
    if (input.type === "fixed_capital") return config.targetAmount ?? 0;
    if (input.type === "annuity_preserve_capital") {
      return netPortfolioIncomeAtAge(input, currentAge) * 12 / withdrawalRate(input.assumptions);
    }
    if (input.type === "annuity_consuming_capital") {
      return capitalNeededForObjectiveAnnuity(input, currentAge, monthlyRateValue);
    }
    if (input.type === "annuity_target_final_capital") {
      return capitalNeededForObjectiveAnnuity(input, currentAge, monthlyRateValue);
    }
    const startAge = currentAge;
    const endAge = projectionEndAge(input.assumptions);
    const months = Math.max(1, Math.round((endAge - startAge) * 12));
    return capitalNeededForAnnuity({
      monthlyIncome: config.monthlyIncome ?? 0,
      months,
      monthlyRate: monthlyRateValue,
      inflationRate: input.assumptions.inflationRate,
      indexed: Boolean(config.indexIncomeToInflation),
      finalCapital: config.finalCapitalTarget ?? 0
    });
  }

  private withdrawalForMonth(input: ObjectiveInput, age: number, month: number, startAge?: number) {
    const config = input.config;
    const starts = age >= (startAge ?? Number.POSITIVE_INFINITY);
    if (!starts || !config.monthlyIncome) return 0;
    if (input.type === "annuity_preserve_capital") return 0;
    if (age > projectionEndAge(input.assumptions)) return 0;
    return netPortfolioIncomeAtAge(input, age);
  }

  private targetCapitalForAge(input: ObjectiveInput, age: number, monthlyRateValue: number) {
    if (input.type === "annuity_consuming_capital") {
      return capitalNeededForObjectiveAnnuity(input, age, monthlyRateValue);
    }
    if (input.type === "annuity_preserve_capital") {
      return netPortfolioIncomeAtAge(input, age) * 12 / withdrawalRate(input.assumptions);
    }
    if (input.type === "annuity_target_final_capital") {
      return capitalNeededForObjectiveAnnuity(input, age, monthlyRateValue);
    }
    return this.targetCapital(input, age, 0, monthlyRateValue);
  }

  private possibleMonthlyIncome(input: ObjectiveInput, capital: number, age: number, monthlyRateValue: number) {
    if (!isAnnuityObjective(input)) return undefined;
    if (input.type === "annuity_consuming_capital") {
      const months = Math.max(1, Math.round((projectionEndAge(input.assumptions) - age) * 12));
      const protectedCapital = input.config.finalCapitalTarget ?? 0;
      const spendableCapital = Math.max(0, capital - protectedCapital / Math.pow(1 + monthlyRateValue, months));
      const portfolioIncome = monthlyRateValue === 0
        ? spendableCapital / months
        : spendableCapital * monthlyRateValue / (1 - Math.pow(1 + monthlyRateValue, -months));
      const pension = age >= input.assumptions.statePensionStartAge ? input.assumptions.statePensionMonthly : 0;
      return portfolioIncome + pension;
    }
    const protectedCapital = input.type === "annuity_target_final_capital" ? input.config.finalCapitalTarget ?? 0 : 0;
    const portfolioIncome = Math.max(0, (capital - protectedCapital) * withdrawalRate(input.assumptions) / 12);
    const pension = age >= input.assumptions.statePensionStartAge ? input.assumptions.statePensionMonthly : 0;
    return portfolioIncome + pension;
  }
}

export const objectiveCalculatorService = new ObjectiveCalculatorService();
