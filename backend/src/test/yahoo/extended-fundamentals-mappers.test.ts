import assert from "node:assert/strict";
import test from "node:test";
import type { YahooSummaryRaw } from "../../services/yahoo/yahoo.raw.js";
import { analystTrendFromSummary, ANALYST_HISTORY_LIMIT } from "../../services/yahoo/fundamentals/mappers/analyst-trend.mapper.js";
import { earningsFromSummary } from "../../services/yahoo/fundamentals/mappers/earnings.mapper.js";
import { yahooFixture } from "../helpers/yahoo-fixtures.js";

const summary = (name: string) => yahooFixture(`${name}.summary.json`) as YahooSummaryRaw;
/** Date de référence des fixtures (enregistrées le 27/09/2026). */
const FIXTURE_NOW = Date.parse("2026-09-27T12:00:00.000Z");

test("analyst trend orders months from oldest to current and compares them", () => {
  const trend = analystTrendFromSummary(summary("euronext-stock-analysts"));
  assert.ok(trend);

  assert.deepEqual(trend.periods.map((period) => period.period), ["-3m", "-2m", "-1m", "0m"]);
  assert.deepEqual(trend.periods.at(-1), { period: "0m", strongBuy: 4, buy: 12, hold: 10, sell: 0, strongSell: 0 });
  assert.equal(trend.direction, "stable");
  assert.deepEqual(trend.history, [], "Euronext stocks often have no grade history");
});

test("analyst trend keeps the ten most recent grade changes", () => {
  const trend = analystTrendFromSummary(summary("us-stock-analysts"));
  assert.ok(trend);
  const [latest] = trend.history;
  assert.ok(latest);

  assert.equal(trend.history.length, ANALYST_HISTORY_LIMIT);
  assert.ok(trend.history.every((change, index, all) => index === 0 || (all[index - 1]?.date ?? "") >= change.date));
  assert.deepEqual(latest, { date: "2026-09-23T17:25:04.000Z", firm: "B of A Securities", action: "reit", fromGrade: "Buy", toGrade: "Buy" });
});

test("analyst trend direction follows the average grade", () => {
  const period = (name: string, strongBuy: number, hold: number) => ({ period: name, strongBuy, buy: 0, hold, sell: 0, strongSell: 0 });
  const trendOf = (older: ReturnType<typeof period>, current: ReturnType<typeof period>) =>
    analystTrendFromSummary({ recommendationTrend: { trend: [current, older] } })?.direction;

  assert.equal(trendOf(period("-3m", 1, 3), period("0m", 3, 1)), "more-positive");
  assert.equal(trendOf(period("-3m", 3, 1), period("0m", 1, 3)), "more-negative");
  assert.equal(analystTrendFromSummary({}), undefined);
});

test("earnings keep reported quarters with surprise and the next publication estimates", () => {
  const earnings = earningsFromSummary(summary("asml-analysts"), FIXTURE_NOW);
  assert.ok(earnings?.next);

  assert.deepEqual(earnings.quarters.map((quarter) => quarter.period), ["-4q", "-3q", "-2q", "-1q"]);
  assert.equal(earnings.quarters[1]?.surprisePercent, -0.0272);
  assert.equal(earnings.currency, "EUR");
  assert.equal(earnings.next.epsAverage, 10.58262);
  assert.equal(earnings.next.isEstimate, false);
});

test("earnings ignore zero-filled quarters and fall back to the chart when history is empty", () => {
  const beforePublication = Date.parse("2026-07-01T00:00:00.000Z");
  const euronext = earningsFromSummary(summary("euronext-stock-analysts"), beforePublication);
  assert.ok(euronext);
  assert.deepEqual(euronext.quarters, [], "LVMH quarters are published with 0 as unknown earnings");
  assert.equal(euronext.next?.revenueAverage, 18524333330);
  assert.equal(earningsFromSummary(summary("euronext-stock-analysts"), FIXTURE_NOW), undefined, "a past publication is not the next one");

  const fromChart = earningsFromSummary({ earnings: { earningsChart: { quarterly: [{ date: "1Q2026", actual: 2, estimate: 0 }] } } }, FIXTURE_NOW);
  assert.deepEqual(fromChart?.quarters, [{ period: "1Q2026", endDate: undefined, epsActual: 2, epsEstimate: undefined, surprisePercent: undefined }]);
  assert.equal(earningsFromSummary({}, FIXTURE_NOW), undefined);
});
