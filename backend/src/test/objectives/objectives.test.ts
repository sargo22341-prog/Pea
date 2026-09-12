import assert from "node:assert/strict";
import test from "node:test";
import { objectiveCalculatorService } from "../../services/objectives/objective-calculator.service.js";

const portfolio = {
  currentCapital: 10_000,
  realSeries: [],
  contributions: [],
  averageMonthlySavings: 500
};

test("objective calculator reports missing required data", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Capital",
    type: "fixed_capital",
    active: true,
    config: {},
    assumptions: {
      futureMonthlySavings: 500,
      inflationRate: 2.5,
      annualReturnRate: 7,
      taxRate: 21,
      statePensionMonthly: 1000,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, portfolio);

  assert.equal(projection.status, "missing_data");
  assert.ok(projection.missingData.some((item) => item.field === "assumptions.currentAge"));
  assert.ok(projection.missingData.some((item) => item.field === "config.targetAmount"));
});

test("objective calculator projects a fixed capital target", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "100k",
    type: "fixed_capital",
    active: true,
    config: { targetAmount: 100_000, targetAge: 45 },
    assumptions: {
      currentAge: 35,
      futureMonthlySavings: 1000,
      inflationRate: 2.5,
      annualReturnRate: 7,
      taxRate: 21,
      statePensionMonthly: 1000,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, portfolio);

  assert.equal(projection.status, "ready");
  assert.equal(projection.summary?.targetCapital, 100_000);
  assert.ok((projection.summary?.progressPercent ?? 0) > 0);
  assert.ok(projection.series.some((point) => point.projected !== undefined));
});

test("objective calculator keeps explicit zero future savings instead of historical fallback", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Zero savings",
    type: "fixed_capital",
    active: true,
    config: { targetAmount: 100_000, targetAge: 36 },
    assumptions: {
      currentAge: 35,
      futureMonthlySavings: 0,
      inflationRate: 0,
      annualReturnRate: 0,
      taxRate: 0,
      statePensionMonthly: 0,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, { ...portfolio, averageMonthlySavings: 500 });

  assert.equal(projection.status, "ready");
  assert.equal(projection.series.find((point) => point.projected !== undefined && point.age > 35)?.projected, 10_000);
});

test("objective calculator falls back to historical savings when future savings is missing", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Fallback savings",
    type: "fixed_capital",
    active: true,
    config: { targetAmount: 100_000, targetAge: 36 },
    assumptions: {
      currentAge: 35,
      futureMonthlySavings: null,
      inflationRate: 0,
      annualReturnRate: 0,
      taxRate: 0,
      statePensionMonthly: 0,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, { ...portfolio, averageMonthlySavings: 500 });

  assert.equal(projection.status, "ready");
  assert.equal(projection.series.find((point) => point.projected !== undefined && point.age > 35)?.projected, 10_500);
});

test("objective calculator computes annuity with final capital", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Rente",
    type: "annuity_target_final_capital",
    active: true,
    config: { monthlyIncome: 2500, finalCapitalTarget: 300_000 },
    assumptions: {
      currentAge: 40,
      futureMonthlySavings: 1500,
      inflationRate: 2.5,
      annualReturnRate: 7,
      taxRate: 21,
      statePensionMonthly: 1000,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, portfolio);

  assert.equal(projection.status, "ready");
  assert.ok((projection.summary?.targetCapital ?? 0) > 300_000);
});

test("objective calculator infers annuity consuming capital start age", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Rente possible",
    type: "annuity_consuming_capital",
    active: true,
    config: { monthlyIncome: 1000 },
    assumptions: {
      currentAge: 35,
      futureMonthlySavings: 2500,
      inflationRate: 2.5,
      annualReturnRate: 7,
      taxRate: 21,
      statePensionMonthly: 1000,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, portfolio);

  assert.equal(projection.status, "ready");
  assert.ok((projection.summary?.reachedAge ?? 0) > 35);
  assert.equal(projection.summary?.message, "objectives.summaryMessage.reachable");
});

test("annuity projections stop future savings after the rent starts by default", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Stop savings",
    type: "annuity_consuming_capital",
    active: true,
    config: { monthlyIncome: 1000 },
    assumptions: {
      currentAge: 60,
      futureMonthlySavings: 1000,
      inflationRate: 0,
      annualReturnRate: 0,
      taxRate: 0,
      projectionEndAge: 90,
      statePensionMonthly: 0,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, { ...portfolio, currentCapital: 400_000, averageMonthlySavings: 0 });

  const firstProjectedMonth = projection.series.find((point) => point.projected !== undefined && point.age > 60);
  assert.equal(projection.status, "ready");
  assert.equal(projection.summary?.reachedAge, 60);
  assert.equal(firstProjectedMonth?.projected, 399_000);
  assert.equal(projection.series.find((point) => point.projected !== undefined && point.age === 60)?.paidMonthlyIncome, 1000);
  assert.ok(projection.series.find((point) => point.projected !== undefined && point.age === 60)?.possibleMonthlyIncome);
  assert.equal(projection.contributions.find((point) => point.kind === "estimated")?.amount, 0);
});

test("annuity projections expose indexed paid income and possible income gap data", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Indexed rent",
    type: "annuity_consuming_capital",
    active: true,
    config: { monthlyIncome: 1000, indexIncomeToInflation: true },
    assumptions: {
      currentAge: 60,
      futureMonthlySavings: 0,
      inflationRate: 12,
      annualReturnRate: 0,
      taxRate: 0,
      projectionEndAge: 90,
      statePensionMonthly: 0,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, { ...portfolio, currentCapital: 2_000_000, averageMonthlySavings: 0 });

  const firstYear = projection.series.find((point) => point.projected !== undefined && point.age > 60 && point.paidMonthlyIncome !== undefined);
  assert.equal(projection.status, "ready");
  assert.ok((firstYear?.paidMonthlyIncome ?? 0) > 1000);
  assert.ok((firstYear?.possibleMonthlyIncome ?? 0) > 0);
});

test("annuity projections can keep saving after the rent starts when explicitly enabled", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Keep savings",
    type: "annuity_consuming_capital",
    active: true,
    config: { monthlyIncome: 1000, continueSavingsAfterAnnuityStart: true },
    assumptions: {
      currentAge: 60,
      futureMonthlySavings: 1000,
      inflationRate: 0,
      annualReturnRate: 0,
      taxRate: 0,
      projectionEndAge: 90,
      statePensionMonthly: 0,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, { ...portfolio, currentCapital: 400_000, averageMonthlySavings: 0 });

  const firstProjectedMonth = projection.series.find((point) => point.projected !== undefined && point.age > 60);
  assert.equal(projection.status, "ready");
  assert.equal(projection.summary?.reachedAge, 60);
  assert.equal(firstProjectedMonth?.projected, 400_000);
  assert.equal(projection.contributions.find((point) => point.kind === "estimated")?.amount, 1000);
});

test("preserve-capital annuity does not consume capital after the rent starts", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Preserve",
    type: "annuity_preserve_capital",
    active: true,
    config: { monthlyIncome: 1000 },
    assumptions: {
      currentAge: 60,
      futureMonthlySavings: 0,
      inflationRate: 0,
      annualReturnRate: 0,
      taxRate: 0,
      withdrawalRate: 4,
      statePensionMonthly: 0,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, { ...portfolio, currentCapital: 400_000, averageMonthlySavings: 0 });

  assert.equal(projection.status, "ready");
  assert.equal(projection.summary?.targetCapital, 300_000);
  assert.ok(projection.series.filter((point) => point.projected !== undefined).every((point) => (point.projected ?? 0) >= 400_000));
});

test("inflation-indexed rent increases required capital for annuities", () => {
  const base = {
    title: "Inflation",
    type: "annuity_consuming_capital" as const,
    active: true,
    config: { monthlyIncome: 2000 },
    assumptions: {
      currentAge: 35,
      futureMonthlySavings: 0,
      inflationRate: 3,
      annualReturnRate: 5,
      taxRate: 0,
      statePensionMonthly: 0,
      statePensionStartAge: 67,
      projectionEndAge: 90,
      scenario: "normal" as const
    }
  };
  const withoutIndexation = objectiveCalculatorService.calculate(base, portfolio);
  const withIndexation = objectiveCalculatorService.calculate({ ...base, config: { ...base.config, indexIncomeToInflation: true } }, portfolio);

  assert.equal(withoutIndexation.status, "ready");
  assert.equal(withIndexation.status, "ready");
  assert.ok((withIndexation.summary?.targetCapital ?? 0) > (withoutIndexation.summary?.targetCapital ?? 0));
});

