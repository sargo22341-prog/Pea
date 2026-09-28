import assert from "node:assert/strict";
import test from "node:test";
import { HEALTH_THRESHOLDS, rateFinancialHealth, rateHealthMetric } from "@pea/shared";

test("each rated indicator switches zone exactly on its shared thresholds", () => {
  for (const [metric, threshold] of Object.entries(HEALTH_THRESHOLDS) as [keyof typeof HEALTH_THRESHOLDS, (typeof HEALTH_THRESHOLDS)[keyof typeof HEALTH_THRESHOLDS]][]) {
    const step = Math.abs(threshold.weak - threshold.good) / 10 || 0.01;
    if (threshold.direction === "higher-is-better") {
      assert.equal(rateHealthMetric(metric, threshold.good), "good", metric);
      assert.equal(rateHealthMetric(metric, threshold.good - step), "fair", metric);
      assert.equal(rateHealthMetric(metric, threshold.weak), "fair", metric);
      assert.equal(rateHealthMetric(metric, threshold.weak - step), "weak", metric);
    } else {
      assert.equal(rateHealthMetric(metric, threshold.good), "good", metric);
      assert.equal(rateHealthMetric(metric, threshold.good + step), "fair", metric);
      assert.equal(rateHealthMetric(metric, threshold.weak), "fair", metric);
      assert.equal(rateHealthMetric(metric, threshold.weak + step), "weak", metric);
    }
  }
});

test("debt ratios are not rated for the financial sector", () => {
  assert.equal(rateHealthMetric("debtToEquity", 900, true), undefined);
  assert.equal(rateHealthMetric("currentRatio", 0.2, true), undefined);
  assert.equal(rateHealthMetric("returnOnEquity", 0.2, true), "good");
});

test("verdict averages the available indicators and needs at least two", () => {
  assert.equal(rateFinancialHealth({ returnOnEquity: 0.3 }, false), undefined);
  assert.deepEqual(rateFinancialHealth({ returnOnEquity: 0.3, debtToEquity: 250 }, false), {
    overall: "fair",
    categories: { profitability: "good", debt: "weak" }
  });
  assert.equal(rateFinancialHealth({ returnOnEquity: 0.01, profitMargin: 0.01, revenueGrowth: -0.1 }, false)?.overall, "weak");
  assert.equal(rateHealthMetric("returnOnEquity", Number.NaN), undefined);
});
