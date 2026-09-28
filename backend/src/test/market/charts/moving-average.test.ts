import assert from "node:assert/strict";
import test from "node:test";
import { movingAverageAt } from "../../../services/market/charts/moving-average.js";

const DAY = 24 * 60 * 60 * 1000;
const closes = (values: number[]) => values.map((close, index) => ({ time: index * DAY, close }));

test("moving average uses the last closes known at each displayed instant", () => {
  const values = movingAverageAt([2 * DAY, 3 * DAY + 3_600_000, 4 * DAY], closes([1, 2, 3, 4, 5]), 3);

  assert.deepEqual(values, [2, 3, 4]);
});

test("moving average is null while the history is shorter than the window", () => {
  assert.deepEqual(movingAverageAt([0, DAY], closes([10, 20]), 3), [null, null]);
  assert.deepEqual(movingAverageAt([DAY], [], 50), [null]);
});

test("moving average skips unreadable closes instead of counting them", () => {
  const withHole = [...closes([1, 2]), { time: 2 * DAY, close: Number.NaN }, { time: 3 * DAY, close: 6 }];

  assert.deepEqual(movingAverageAt([3 * DAY], withHole, 3), [3]);
});

test("moving average sorts closes and stays constant within an intraday session", () => {
  const shuffled = closes([4, 8, 12]).reverse();

  assert.deepEqual(movingAverageAt([2 * DAY + 1_000, 2 * DAY + 50_000], shuffled, 2), [10, 10]);
});
