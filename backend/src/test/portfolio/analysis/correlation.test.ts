import assert from "node:assert/strict";
import test from "node:test";
import { HIGH_CORRELATION_THRESHOLD } from "@pea/shared";
import { CORRELATION_MIN_OBSERVATIONS, alignedReturns, correlationMatrix, pearson, type CloseSeries } from "../../../services/portfolio/analysis/correlation.js";

const START = Date.UTC(2025, 0, 1);
const DAY_MS = 86_400_000;
const day = (index: number) => new Date(START + index * DAY_MS).toISOString().slice(0, 10);

/** Série déterministe : `shape(index)` donne la variation relative de la séance. */
function series(symbol: string, length: number, shape: (index: number) => number, offset = 0): CloseSeries {
  let close = 100;
  const closes = Array.from({ length }, (_, index) => {
    close *= 1 + shape(index);
    return { day: day(index + offset), close };
  });
  return { symbol, name: symbol, closes };
}

const wave = (index: number) => Math.sin(index / 3) / 50;

test("pearson returns 1, -1 and null for identical, opposite and constant series", () => {
  assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(pearson([1, 2, 3], [3, 2, 1]), -1);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
});

test("returns are computed on common trading days only", () => {
  const a = new Map([["2025-01-01", 100], ["2025-01-02", 110], ["2025-01-03", 121]]);
  const b = new Map([["2025-01-01", 50], ["2025-01-03", 60]]);

  const { returnsA, returnsB } = alignedReturns(a, b);
  assert.equal(returnsA.length, 1);
  assert.equal(Number(returnsA[0]?.toFixed(6)), 0.21);
  assert.equal(Number(returnsB[0]?.toFixed(6)), 0.2);
});

test("the matrix flags highly correlated pairs and keeps a symmetric layout", () => {
  const length = CORRELATION_MIN_OBSERVATIONS + 20;
  const matrix = correlationMatrix([
    series("A", length, wave),
    series("B", length, (index) => wave(index) * 2),
    series("C", length, (index) => Math.cos(index * 1.7) / 60)
  ]);

  assert.ok(matrix);
  assert.deepEqual(matrix.assets.map((asset) => asset.symbol), ["A", "B", "C"]);
  const first = matrix.matrix[0];
  const third = matrix.matrix[2];
  assert.ok(first && third);
  assert.equal(first[0], 1);
  assert.equal(first[2], third[0]);
  assert.deepEqual(matrix.highPairs.map((pair) => [pair.a, pair.b]), [["A", "B"]]);
  assert.ok((matrix.highPairs[0]?.value ?? 0) > HIGH_CORRELATION_THRESHOLD);
  assert.equal(matrix.observations, length - 1);
});

test("lines with a short or constant history are dropped, and fewer than two lines give no matrix", () => {
  const length = CORRELATION_MIN_OBSERVATIONS + 5;
  const withShort = correlationMatrix([
    series("A", length, wave),
    series("B", length, (index) => wave(index + 1)),
    series("NEW", 10, wave, length - 10),
    series("FLAT", length, () => 0)
  ]);

  assert.deepEqual(withShort?.assets.map((asset) => asset.symbol), ["A", "B"]);
  assert.equal(correlationMatrix([series("A", length, wave), series("NEW", 10, wave)]), undefined);
  assert.equal(correlationMatrix([]), undefined);
});
