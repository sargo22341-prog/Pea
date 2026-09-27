import type { AssetChartDto } from "@pea/shared";
import assert from "node:assert/strict";
import test from "node:test";
import { downsampleChartForDisplay, largestTriangleThreeBucketsIndexes } from "../../../services/market/charts/chart-display-downsample.js";

function dailyChart(points: number, spikeIndex?: number): AssetChartDto {
  const timestamps = Array.from({ length: points }, (_value, index) => Date.UTC(2000, 0, 3) + index * 86_400_000);
  const prices = timestamps.map((_time, index) => (index === spikeIndex ? 500 : 100 + Math.sin(index / 50) * 5));
  return {
    symbol: "TTE.PA",
    range: "ALL",
    interval: "1d",
    timestamps,
    prices,
    performance: prices.map((price) => price - 100),
    performanceEuro: 12,
    performancePercent: 3,
    cachedAt: 0,
    expiresAt: 0
  };
}

test("long asset histories are reduced for display while keeping bounds, order and spikes", () => {
  const chart = dailyChart(6900, 4321);
  const reduced = downsampleChartForDisplay(chart, "all");

  assert.equal(reduced.timestamps.length, 1000);
  assert.equal(reduced.prices.length, 1000);
  assert.equal(reduced.performance?.length, 1000);
  assert.equal(reduced.timestamps[0], chart.timestamps[0]);
  assert.equal(reduced.timestamps.at(-1), chart.timestamps.at(-1));
  assert.ok(reduced.timestamps.every((time, index) => index === 0 || time > (reduced.timestamps[index - 1] ?? 0)));
  assert.ok(reduced.prices.includes(500), "the isolated spike must survive");
  assert.equal(reduced.performanceEuro, 12);
  assert.equal(reduced.performancePercent, 3);
});

test("short ranges and short series are returned untouched", () => {
  const long = dailyChart(6900);
  const short = dailyChart(800);

  assert.equal(downsampleChartForDisplay(long, "1y"), long);
  assert.equal(downsampleChartForDisplay(short, "all"), short);
});

test("bucket selection returns every index when the series fits the threshold", () => {
  assert.deepEqual(largestTriangleThreeBucketsIndexes([1, 2, 3], [5, 6, 7], 10), [0, 1, 2]);
  assert.deepEqual(largestTriangleThreeBucketsIndexes([], [], 10), []);
});
