import assert from "node:assert/strict";
import test from "node:test";
import type { DividendSustainabilityItem, FinancialStatementRow, PositionWithMarket } from "@pea/shared";
import { LARGE_CAP_MIN_EUR, MID_CAP_MIN_EUR, capitalizationBucket } from "../../../services/portfolio/analysis/capitalization.js";
import { dividendSustainabilityItem, sortBySustainability } from "../../../services/portfolio/analysis/dividend-sustainability.js";

function position(symbol: string): PositionWithMarket {
  return {
    id: 1, symbol, name: symbol, quantity: 1, averageBuyPrice: 10, currency: "EUR", createdAt: "2026-01-01T00:00:00.000Z",
    currentPrice: 10, marketValue: 10, costBasis: 10, performance: 0, performancePercent: 0
  };
}

test("capitalization buckets use the named thresholds in euros", () => {
  assert.equal(capitalizationBucket(LARGE_CAP_MIN_EUR, "EUR", false), "large");
  assert.equal(capitalizationBucket(LARGE_CAP_MIN_EUR - 1, "EUR", false), "mid");
  assert.equal(capitalizationBucket(MID_CAP_MIN_EUR, "EUR", false), "mid");
  assert.equal(capitalizationBucket(MID_CAP_MIN_EUR - 1, "EUR", false), "small");
  assert.equal(capitalizationBucket(50_000_000_000, "EUR", true), "etf");
});

test("a capitalization in another currency is converted before bucketing, an unknown currency is not guessed", () => {
  // 12 milliards de couronnes danoises valent environ 1,6 milliard d'euros.
  assert.equal(capitalizationBucket(12_000_000_000, "DKK", false), "small");
  assert.equal(capitalizationBucket(12_000_000_000, "XYZ", false), "unknown");
  assert.equal(capitalizationBucket(undefined, "EUR", false), "unknown");
  assert.equal(capitalizationBucket(-1, "EUR", false), "unknown");
});

const cashFlow = (endDate: string, freeCashFlow: number, dividendsPaid: number): FinancialStatementRow => ({ endDate, freeCashFlow, dividendsPaid });

test("dividend sustainability combines the payout ratio and the latest annual FCF coverage", () => {
  const item = dividendSustainabilityItem(position("AI.PA"), { summaryDetail: { payoutRatio: 0.55 } }, 40, [cashFlow("2024-12-31", 100, 50), cashFlow("2025-12-31", 90, 60)]);

  assert.deepEqual(item, { symbol: "AI.PA", name: "AI.PA", weight: 40, payoutRatio: 0.55, fcfCoverage: 1.5 });
});

test("a line without payout ratio nor cash-flow data is left out", () => {
  assert.equal(dividendSustainabilityItem(position("GROWTH.PA"), { summaryDetail: { payoutRatio: 0 } }, 10, []), undefined);
  assert.equal(dividendSustainabilityItem(position("NEW.PA"), undefined, 10, []), undefined);
});

test("lines are ranked from the best covered dividend to the most fragile, unknown payout last", () => {
  const item = (symbol: string, payoutRatio?: number): DividendSustainabilityItem => ({ symbol, name: symbol, weight: 1, payoutRatio, fcfCoverage: payoutRatio === undefined ? 2 : undefined });
  const sorted = sortBySustainability([item("UNKNOWN"), item("HIGH", 1.2), item("LOSS", -0.4), item("LOW", 0.3), item("MID", 0.7)]);

  assert.deepEqual(sorted.map((entry) => entry.symbol), ["LOW", "MID", "HIGH", "LOSS", "UNKNOWN"]);
});
