import assert from "node:assert/strict";
import test from "node:test";
import { financialHealthFromSummary } from "../../services/yahoo/fundamentals/mappers/health.mapper.js";
import { valuationFromSummary } from "../../services/yahoo/fundamentals/mappers/valuation.mapper.js";
import { yahooSummaryFixture } from "../helpers/yahoo-fixtures.js";

test("valuation mapper combines key statistics, summary detail and price", () => {
  const valuation = valuationFromSummary(yahooSummaryFixture("euronext-stock"));
  assert.ok(valuation);

  assert.deepEqual(
    {
      trailingPE: valuation.trailingPE,
      forwardPE: valuation.forwardPE,
      priceToBook: valuation.priceToBook,
      priceToSales: valuation.priceToSales,
      trailingEps: valuation.trailingEps,
      enterpriseToEbitda: valuation.enterpriseToEbitda,
      fiftyTwoWeekChange: valuation.fiftyTwoWeekChange,
      indexFiftyTwoWeekChange: valuation.indexFiftyTwoWeekChange,
      lastSplitFactor: valuation.lastSplitFactor,
      lastSplitDate: valuation.lastSplitDate,
      currency: valuation.currency
    },
    {
      trailingPE: 18.079727,
      forwardPE: 16.00625,
      priceToBook: 2.8737257,
      priceToSales: 2.4564388,
      trailingEps: 21.95,
      enterpriseToEbitda: 11.081,
      fiftyTwoWeekChange: -0.24087173,
      indexFiftyTwoWeekChange: 0.16246295,
      lastSplitFactor: "5:1",
      lastSplitDate: "2000-07-03T00:00:00.000Z",
      currency: "EUR"
    }
  );
});

test("valuation mapper keeps a negative multiple for the n.s. display and hides sparse blocks", () => {
  assert.equal(valuationFromSummary({ summaryDetail: { trailingPE: -4.2, priceToSalesTrailing12Months: 1.1 } })?.trailingPE, -4.2);
  assert.equal(valuationFromSummary({ summaryDetail: { trailingPE: 12 } }), undefined);
  assert.equal(valuationFromSummary(yahooSummaryFixture("etf-with-returns")), undefined, "ETFs have no valuation block");
  assert.equal(valuationFromSummary(yahooSummaryFixture("empty")), undefined);
});

test("health mapper rates a real industrial company with shared thresholds", () => {
  const health = financialHealthFromSummary(yahooSummaryFixture("euronext-stock"));
  assert.ok(health);

  assert.equal(health.isFinancialSector, false);
  assert.equal(health.metrics.debtToEquity, 53.306);
  assert.deepEqual(health.verdict, {
    overall: "good",
    categories: { profitability: "good", debt: "good", growth: "weak" }
  });
});

test("health mapper skips debt ratios and zero-filled margins for banks", () => {
  const health = financialHealthFromSummary(yahooSummaryFixture("euronext-bank"));
  assert.ok(health?.verdict);

  assert.equal(health.isFinancialSector, true);
  assert.equal(health.metrics.debtToEquity, undefined);
  assert.equal(health.metrics.grossMargin, undefined);
  assert.equal(health.verdict.categories.debt, undefined);
  assert.equal(health.verdict.overall, "good");
});

test("health mapper returns no verdict with fewer than two rated indicators", () => {
  const health = financialHealthFromSummary({ financialData: { returnOnEquity: 0.2, totalCash: 10 } });
  assert.ok(health);

  assert.equal(health.metrics.returnOnEquity, 0.2);
  assert.equal(health.verdict, undefined);
  assert.equal(financialHealthFromSummary(yahooSummaryFixture("empty")), undefined);
});
