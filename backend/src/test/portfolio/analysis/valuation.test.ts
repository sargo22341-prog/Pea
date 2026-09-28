import assert from "node:assert/strict";
import test from "node:test";
import type { PortfolioValuationItem, PositionWithMarket } from "@pea/shared";
import { portfolioValuation, valuationItem } from "../../../services/portfolio/analysis/valuation.js";

const item = (symbol: string, weight: number, values: Partial<PortfolioValuationItem> = {}): PortfolioValuationItem => ({ symbol, name: symbol, weight, ...values });

function position(symbol: string, dividendYield?: number): PositionWithMarket {
  return {
    id: 1, symbol, name: symbol, quantity: 1, averageBuyPrice: 10, currency: "EUR", createdAt: "2026-01-01T00:00:00.000Z",
    currentPrice: 10, marketValue: 10, costBasis: 10, performance: 0, performancePercent: 0,
    quote: { symbol, name: symbol, price: 10, currency: "EUR", dividendYield }
  };
}

test("the weighted PER is a harmonic mean over the lines with a meaningful multiple", () => {
  const valuation = portfolioValuation([item("A", 50, { trailingPE: 10 }), item("B", 30, { trailingPE: 30 }), item("LOSS", 20, { trailingPE: -5 })]);

  // 80 points de valeur pour 50/10 + 30/30 = 6 points de bénéfices : PER 80 / 6.
  assert.equal(valuation.trailingPE.value, 80 / 6);
  assert.equal(valuation.trailingPE.coverage, 80, "a loss-making line is excluded and reported through the coverage");
});

test("yield and beta are arithmetic means on their own coverage", () => {
  const valuation = portfolioValuation([item("A", 60, { dividendYield: 0.05, beta: 1.2 }), item("B", 40, { dividendYield: 0 }), item("C", 0, { beta: 9 })]);

  assert.equal(valuation.dividendYield.value, 0.03);
  assert.equal(valuation.dividendYield.coverage, 100);
  assert.equal(valuation.beta.value, 1.2, "a zero-weight line never moves the average");
  assert.equal(valuation.beta.coverage, 60);
  assert.deepEqual(valuation.items.map((entry) => entry.symbol), ["A", "B", "C"]);
});

test("a portfolio without any data exposes empty metrics instead of NaN", () => {
  const valuation = portfolioValuation([item("A", 100)]);

  assert.deepEqual([valuation.trailingPE, valuation.dividendYield, valuation.beta], [{ coverage: 0 }, { coverage: 0 }, { coverage: 0 }]);
});

test("a stock whose summary has no dividend yields zero while an unknown line stays unknown", () => {
  const nonPayer = valuationItem(position("GROWTH.PA"), { summaryDetail: { trailingPE: 40, beta: 1.4 } }, 50);
  const unknown = valuationItem(position("NEW.PA"), undefined, 50);
  const fromQuote = valuationItem(position("QUOTE.PA", 0.04), undefined, 50);

  assert.deepEqual([nonPayer.trailingPE, nonPayer.dividendYield, nonPayer.beta], [40, 0, 1.4]);
  assert.equal(unknown.dividendYield, undefined);
  assert.equal(fromQuote.dividendYield, 0.04);
});

test("an ETF takes its 3-year beta from the fund risk statistics", () => {
  const etf = valuationItem(position("CW8.PA"), {
    fundPerformance: { riskOverviewStatistics: { riskStatistics: [{ year: "3y", beta: 0.98 }] } }
  }, 40);

  assert.equal(etf.beta, 0.98);
});
