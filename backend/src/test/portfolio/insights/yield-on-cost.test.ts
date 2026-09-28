import assert from "node:assert/strict";
import test from "node:test";
import { portfolioYieldOnCost, positionYieldOnCost } from "../../../services/portfolio/insights/yield-on-cost.js";

test("position yield on cost divides the annual dividend by the average buy price", () => {
  assert.equal(positionYieldOnCost(3, 60), 0.05);
  assert.equal(positionYieldOnCost(0, 60), 0, "a cut dividend yields zero, not an absent value");
});

test("position yield on cost is absent without a dividend or a usable cost", () => {
  assert.equal(positionYieldOnCost(undefined, 60), undefined);
  assert.equal(positionYieldOnCost(Number.NaN, 60), undefined);
  assert.equal(positionYieldOnCost(-1, 60), undefined);
  assert.equal(positionYieldOnCost(3, 0), undefined, "a zero cost (free shares) has no meaningful yield");
  assert.equal(positionYieldOnCost(3, -5), undefined);
});

test("portfolio yield on cost is weighted by cost, positions without dividend included", () => {
  const value = portfolioYieldOnCost([
    { estimatedAnnualDividend: 30, costBasis: 600 },
    { estimatedAnnualDividend: undefined, costBasis: 400 }
  ]);
  assert.equal(value, 0.03);
});

test("portfolio yield on cost is absent when nothing pays a known dividend or nothing was invested", () => {
  assert.equal(portfolioYieldOnCost([]), undefined);
  assert.equal(portfolioYieldOnCost([{ estimatedAnnualDividend: undefined, costBasis: 500 }]), undefined);
  assert.equal(portfolioYieldOnCost([{ estimatedAnnualDividend: 12, costBasis: 0 }]), undefined);
});
