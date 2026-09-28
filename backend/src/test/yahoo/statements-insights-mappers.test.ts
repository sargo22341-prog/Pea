import assert from "node:assert/strict";
import test from "node:test";
import { statementRowsFromTimeSeries, trailingTwelveMonthsRow } from "../../services/yahoo/fundamentals/mappers/statement-rows.mapper.js";
import { insightsFromResponse } from "../../services/yahoo/insights/insights.mapper.js";
import { similarSymbolsFromResponse } from "../../services/yahoo/recommendations/similar.job.js";
import { yahooFixture } from "../helpers/yahoo-fixtures.js";

test("statement rows align balance sheet and cash flow and report outflows as positive amounts", () => {
  const rows = statementRowsFromTimeSeries(
    yahooFixture("euronext-stock.balance-sheet.annual.json"),
    yahooFixture("euronext-stock.cash-flow.annual.json")
  );
  const latest = rows.at(-1);
  assert.ok(latest);

  assert.ok(rows.length >= 4);
  assert.ok(rows.every((row, index) => index === 0 || (rows[index - 1]?.endDate ?? "") < row.endDate));
  assert.ok(latest.totalEquity !== undefined && latest.totalEquity > 0);
  assert.ok(latest.netDebt !== undefined);
  for (const outflow of [latest.capex, latest.dividendsPaid]) assert.ok(outflow !== undefined && outflow > 0);
});

test("statement rows tolerate series with holes", () => {
  const rows = statementRowsFromTimeSeries(
    [{ date: "2025-12-31T00:00:00.000Z", totalDebt: 100, cashAndCashEquivalents: 30 }],
    [{ date: "2024-12-31T00:00:00.000Z", freeCashFlow: 12 }, { date: "2023-12-31T00:00:00.000Z" }]
  );

  assert.deepEqual(rows.map((row) => [row.endDate.slice(0, 10), row.netDebt, row.freeCashFlow]), [
    ["2024-12-31", undefined, 12],
    ["2025-12-31", 70, undefined]
  ]);
});

test("trailing twelve months need four consecutive quarters", () => {
  const quarterly = statementRowsFromTimeSeries([], yahooFixture("us-stock.cash-flow.quarterly.json"));
  const ttm = trailingTwelveMonthsRow(quarterly);
  const lastFour = quarterly.slice(-4);
  assert.ok(ttm);

  assert.equal(ttm.isTtm, true);
  assert.equal(ttm.freeCashFlow, lastFour.reduce((sum, row) => sum + (row.freeCashFlow ?? 0), 0));

  const semiAnnual = statementRowsFromTimeSeries(yahooFixture("euronext-stock.balance-sheet.quarterly.json"), [
    { date: "2024-12-31T00:00:00.000Z", freeCashFlow: 1 },
    { date: "2025-06-30T00:00:00.000Z", freeCashFlow: 1 },
    { date: "2025-12-31T00:00:00.000Z", freeCashFlow: 1 },
    { date: "2026-06-30T00:00:00.000Z", freeCashFlow: 1 }
  ]);
  assert.equal(trailingTwelveMonthsRow(semiAnnual), undefined, "half-year reports never add up to twelve months");
});

test("insights expose Trading Central signals but never promotional content", () => {
  const insights = insightsFromResponse(yahooFixture("us-stock.insights.json"));

  assert.deepEqual(insights, {
    provider: "Trading Central",
    shortTerm: { direction: "bearish", score: 2 },
    midTerm: { direction: "bullish", score: 2 },
    longTerm: { direction: "neutral", score: 0 },
    support: 255.65,
    resistance: 344.5699,
    stopLoss: 307.538705,
    valuation: { label: "overvalued", discount: -0.08 }
  });
  assert.equal(insightsFromResponse(yahooFixture("euronext-stock.insights.json")), undefined, "no instrumentInfo for LVMH");
  assert.equal(insightsFromResponse(null), undefined);
});

test("similar symbols are sorted by score without the asset itself", () => {
  assert.deepEqual(similarSymbolsFromResponse(yahooFixture("euronext-stock.similar.json"), "MC.PA"), ["RMS.PA", "OR.PA", "KER.PA", "AI.PA", "SAN.PA"]);
  assert.deepEqual(
    similarSymbolsFromResponse({ recommendedSymbols: [{ symbol: "mc.pa", score: 1 }, { symbol: "OR.PA", score: 0.2 }, { symbol: "OR.PA", score: 0.1 }] }, "MC.PA"),
    ["OR.PA"]
  );
  assert.deepEqual(similarSymbolsFromResponse({}, "MC.PA"), []);
});
