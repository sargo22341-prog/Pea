import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";

interface WindowResult {
  range: string;
  kept: number;
  expected: number;
  mismatches: string[];
  lowerBoundBeforeKept: boolean;
}

test("range filtering by market-day bounds keeps exactly the points of the market days, across DST and weekends", () => {
  const results = runBackendScript(`
    const { filterRangePoints, openMarketWindow, rangeLowerBoundIso } = await import("./services/market/charts/chart-range-window.ts");
    const { getMarketDateKey } = await import("./services/market/calendars/marketCalendar.service.ts");
    const output = [];
    const cases = [
      { asset: { symbol: "AIR.PA", exchange: "Paris" }, endDate: new Date("2026-03-30T12:00:00.000Z") },
      { asset: { symbol: "AAPL", exchange: "NASDAQ" }, endDate: new Date("2026-11-03T18:00:00.000Z") }
    ];
    for (const { asset, endDate } of cases) {
      const points = [];
      for (let time = endDate.getTime() - 40 * 86400000; time <= endDate.getTime(); time += 17 * 60000) {
        points.push({ date: new Date(time).toISOString(), close: 1 });
      }
      for (const range of ["1d", "1w", "1m"]) {
        const window = openMarketWindow(asset, range, endDate);
        const expected = points.filter((point) => window.dateSet.has(getMarketDateKey(asset.symbol, asset.exchange, new Date(point.date))));
        const kept = filterRangePoints(points, range, asset, endDate);
        const keptDates = new Set(kept.map((point) => point.date));
        const mismatches = expected.filter((point) => !keptDates.has(point.date)).map((point) => point.date)
          .concat(kept.length === expected.length ? [] : ["length " + kept.length + " vs " + expected.length]);
        const lowerBound = rangeLowerBoundIso(range, asset, endDate);
        output.push({
          range: asset.symbol + ":" + range,
          kept: kept.length,
          expected: expected.length,
          mismatches,
          lowerBoundBeforeKept: kept.every((point) => point.date >= lowerBound)
            && points.filter((point) => point.date < lowerBound).every((point) => !keptDates.has(point.date))
        });
      }
    }
    console.log("__RESULT__" + JSON.stringify(output));
  `) as WindowResult[];

  assert.equal(results.length, 6);
  for (const result of results) {
    assert.ok(result.expected > 0, result.range);
    assert.deepEqual(result.mismatches, [], result.range);
    assert.equal(result.kept, result.expected, result.range);
    assert.ok(result.lowerBoundBeforeKept, result.range);
  }
});

test("long ranges read candles from the calendar cutoff and all has no lower bound", () => {
  const result = runBackendScript(`
    const { rangeLowerBoundIso, rangeCutoff } = await import("./services/market/charts/chart-range-window.ts");
    const asset = { symbol: "AIR.PA", exchange: "Paris" };
    console.log("__RESULT__" + JSON.stringify({
      all: rangeLowerBoundIso("all", asset) ?? null,
      fiveYears: rangeLowerBoundIso("5y", asset),
      fiveYearsCutoff: new Date(rangeCutoff("5y")).toISOString()
    }));
  `) as { all: string | null; fiveYears: string; fiveYearsCutoff: string };

  assert.equal(result.all, null);
  assert.ok(Date.parse(result.fiveYears) <= Date.parse(result.fiveYearsCutoff) + 1000);
  assert.ok(Date.parse(result.fiveYearsCutoff) - Date.parse(result.fiveYears) < 60_000);
});
