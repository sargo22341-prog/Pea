import assert from "node:assert/strict";
import test from "node:test";
import { fundDetailsFromSummary, holdingsFromSummary } from "../../services/yahoo/fundamentals/mappers/fund.mapper.js";
import { yahooSummaryFixture } from "../helpers/yahoo-fixtures.js";

test("fund mapper reads returns, yearly returns, risk and allocation of a real ETF", () => {
  const fund = fundDetailsFromSummary(yahooSummaryFixture("etf-with-returns"));
  assert.ok(fund);
  const { trailingReturns, annualReturns, risk, allocation } = fund;
  assert.ok(trailingReturns && annualReturns && risk && allocation);

  assert.equal(fund.family, "Amundi Luxembourg S.A.");
  assert.equal(fund.annualReportExpenseRatio, 0.0038);
  assert.deepEqual(
    { ytd: trailingReturns.ytd, tenYear: trailingReturns.tenYear, asOfDate: trailingReturns.asOfDate },
    { ytd: 0.140985, tenYear: 0.123628594, asOfDate: "2026-09-25T00:00:00.000Z" }
  );
  assert.deepEqual(annualReturns.map((row) => row.year), [2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  assert.equal(annualReturns.find((row) => row.year === 2022)?.value, -0.1374484);
  const expectedRisk = { volatility: 0.1224, sharpe: 1.17, beta: 0.99, alpha: -0.0021, rSquared: 0.9876 };
  for (const [key, expected] of Object.entries(expectedRisk)) {
    const actual: number | undefined = risk[key as keyof typeof expectedRisk];
    assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-9, `${key}: ${String(actual)}`);
  }
  assert.equal(allocation.stock, 0.9996);
  assert.equal(fund.holdings, undefined, "an ETF without published holdings has no holdings block");
  assert.equal(fund.sectorWeightings?.find((row) => row.key === "technology")?.value, 0.3062);
});

test("fund mapper keeps the ten holdings but drops Yahoo zero-filled returns", () => {
  const fund = fundDetailsFromSummary(yahooSummaryFixture("etf-with-holdings"));
  assert.ok(fund?.holdings);

  assert.equal(fund.holdings.length, 10);
  assert.deepEqual(fund.holdings[0], { symbol: "NVDA", name: "NVIDIA Corp", weight: 0.0543234 });
  assert.equal(fund.trailingReturns, undefined);
  assert.equal(fund.risk, undefined);
});

test("fund mapper converts holdings published as percentages into fractions", () => {
  const holdings = holdingsFromSummary({
    topHoldings: {
      holdings: [
        { symbol: "B", holdingName: "Beta", holdingPercent: 2.5 },
        { symbol: "A", holdingName: "Alpha", holdingPercent: 5 },
        { symbol: "Z", holdingName: "Zero", holdingPercent: 0 }
      ]
    }
  });

  assert.deepEqual(holdings, [
    { symbol: "A", name: "Alpha", weight: 0.05 },
    { symbol: "B", name: "Beta", weight: 0.025 }
  ]);
});

test("fund mapper ignores stocks and empty responses", () => {
  assert.equal(fundDetailsFromSummary(yahooSummaryFixture("euronext-stock")), undefined);
  assert.equal(fundDetailsFromSummary(yahooSummaryFixture("empty")), undefined);
});
