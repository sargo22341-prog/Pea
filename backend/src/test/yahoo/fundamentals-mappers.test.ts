import assert from "node:assert/strict";
import test from "node:test";
import { analystConsensusFromSummary } from "../../services/yahoo/fundamentals/mappers/analysts.mapper.js";
import { calendarEventsDataFromSummary } from "../../services/yahoo/fundamentals/mappers/calendar.mapper.js";
import { marketInfoFromSummary } from "../../services/yahoo/fundamentals/mappers/market-info.mapper.js";
import { financialRowsFromTimeSeries } from "../../services/yahoo/fundamentals/mappers/statements.mapper.js";
import { yahooFixture, yahooSummaryFixture } from "../helpers/yahoo-fixtures.js";

test("market info mapper reads a real Euronext quoteSummary", () => {
  const info = marketInfoFromSummary(yahooSummaryFixture("euronext-stock"));

  assert.equal(info.currency, "EUR");
  assert.equal(info.fiftyTwoWeekLow, 395.15);
  assert.equal(info.fiftyTwoWeekHigh, 654.7);
  assert.equal(info.dividendRate, 13);
  assert.equal(info.dividendYield, 0.0328);
  assert.equal(info.payoutRatio, 0.5925);
  assert.equal(info.exDividendDate, "2026-12-01T00:00:00.000Z");
});

test("market info mapper survives an empty response", () => {
  const info = marketInfoFromSummary(yahooSummaryFixture("empty"));

  assert.ok(Object.values(info).every((value) => value === undefined));
});

test("calendar mapper keeps the first earnings date and its estimate flag", () => {
  const calendar = calendarEventsDataFromSummary(yahooSummaryFixture("euronext-stock"));

  assert.deepEqual(calendar, {
    earningsDate: "2026-07-27T15:30:00.000Z",
    earningsCallDate: "2026-07-27T15:30:00.000Z",
    isEarningsDateEstimate: false,
    exDividendDate: "2026-12-01T00:00:00.000Z",
    dividendDate: undefined
  });
  assert.equal(calendarEventsDataFromSummary(yahooSummaryFixture("empty")), undefined);
});

test("analyst mapper requires at least one analyst opinion", () => {
  const consensus = analystConsensusFromSummary(yahooSummaryFixture("euronext-stock"));
  assert.ok(consensus);

  assert.equal(consensus.numberOfAnalystOpinions, 26);
  assert.equal(consensus.recommendationKey, "buy");
  assert.equal(analystConsensusFromSummary(yahooSummaryFixture("etf-with-returns")), undefined);
  assert.equal(analystConsensusFromSummary({ financialData: { numberOfAnalystOpinions: 0 } }), undefined);
});

test("statements mapper keeps complete fiscal years from the flat v4 time series", () => {
  const rows = financialRowsFromTimeSeries(yahooFixture("euronext-stock.financials.json"));

  assert.deepEqual(rows.map((row) => row.year), [2022, 2023, 2024, 2025]);
  const last = rows.at(-1);
  assert.ok(last);
  assert.ok(Math.abs(last.netMargin - (last.netIncome / last.revenue) * 100) < 1e-9);
});

test("statements mapper still reads the legacy annual series with timestamps", () => {
  const rows = financialRowsFromTimeSeries({
    timeseries: {
      result: [
        { timestamp: [1_672_444_800], annualTotalRevenue: [{ reportedValue: { raw: 200 } }] },
        { timestamp: [1_672_444_800], annualNetIncome: [{ reportedValue: { raw: 20 } }] }
      ]
    }
  });

  assert.deepEqual(rows, [{ year: 2022, revenue: 200, netIncome: 20, netMargin: 10 }]);
});

test("statements mapper ignores years with holes and zero revenue", () => {
  const rows = financialRowsFromTimeSeries([
    { date: "2023-12-31T00:00:00.000Z", totalRevenue: 100 },
    { date: "2024-12-31T00:00:00.000Z", totalRevenue: 0, netIncome: 5 },
    { date: "2025-12-31T00:00:00.000Z", totalRevenue: 50, netIncome: 5 }
  ]);

  assert.deepEqual(rows.map((row) => row.year), [2025]);
});
