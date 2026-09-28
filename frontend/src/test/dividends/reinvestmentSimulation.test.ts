import { describe, expect, it } from "vitest";
import { REINVESTMENT_GROWTH, REINVESTMENT_HORIZON_YEARS, defaultReinvestmentGrowth, simulateReinvestment } from "../../pages/dividends/utils/reinvestmentSimulation";

describe("simulateReinvestment", () => {
  it("keeps a flat income without growth nor reinvestment, and compounds the yield when reinvesting", () => {
    const points = simulateReinvestment({ marketValue: 10_000, annualIncome: 400, growthRate: 0, horizonYears: 5 });

    expect(points).toHaveLength(6);
    expect(points.map((point) => point.incomeWithout)).toEqual([400, 400, 400, 400, 400, 400]);
    expect(points[0]?.incomeWith).toBe(400);
    expect(points[5]?.incomeWith).toBeCloseTo(400 * 1.04 ** 5, 6);
    expect(points[5]?.cumulativeWithout).toBe(2000);
    expect(points[0]?.cumulativeWith).toBe(0);
  });

  it("applies the dividend growth to both scenarios", () => {
    const points = simulateReinvestment({ marketValue: 10_000, annualIncome: 300, growthRate: 0.05, horizonYears: 10 });
    const last = points.at(-1);

    expect(last?.incomeWithout).toBeCloseTo(300 * 1.05 ** 10, 6);
    expect(last?.incomeWith).toBeCloseTo(300 * (1.05 * 1.03) ** 10, 6);
  });

  it("clamps the horizon and the growth to the slider bounds", () => {
    expect(simulateReinvestment({ marketValue: 1000, annualIncome: 10, growthRate: 0, horizonYears: 99 })).toHaveLength(REINVESTMENT_HORIZON_YEARS.max + 1);
    expect(simulateReinvestment({ marketValue: 1000, annualIncome: 10, growthRate: 0, horizonYears: 1 })).toHaveLength(REINVESTMENT_HORIZON_YEARS.min + 1);
    const capped = simulateReinvestment({ marketValue: 1000, annualIncome: 10, growthRate: 0.5, horizonYears: 5 });
    expect(capped[1]?.incomeWithout).toBeCloseTo(10 * (1 + REINVESTMENT_GROWTH.max), 6);
  });

  it("returns nothing without income or portfolio value", () => {
    expect(simulateReinvestment({ marketValue: 0, annualIncome: 10, growthRate: 0, horizonYears: 5 })).toEqual([]);
    expect(simulateReinvestment({ marketValue: 1000, annualIncome: 0, growthRate: 0, horizonYears: 5 })).toEqual([]);
    expect(simulateReinvestment({ marketValue: Number.NaN, annualIncome: 10, growthRate: 0, horizonYears: 5 })).toEqual([]);
  });
});

describe("defaultReinvestmentGrowth", () => {
  it("weights each asset growth by its income and rounds to the slider step", () => {
    expect(defaultReinvestmentGrowth([{ income: 300, growthRate: 0.04 }, { income: 100, growthRate: 0.08 }, { income: 500, growthRate: undefined }])).toBeCloseTo(0.05, 10);
  });

  it("stays within the slider bounds", () => {
    expect(defaultReinvestmentGrowth([{ income: 100, growthRate: -1 }])).toBe(0);
    expect(defaultReinvestmentGrowth([{ income: 100, growthRate: 0.4 }])).toBeCloseTo(REINVESTMENT_GROWTH.max, 10);
    expect(defaultReinvestmentGrowth([])).toBe(0);
  });
});
