import assert from "node:assert/strict";
import test from "node:test";
import { replayTransactions } from "../../../services/portfolio/portfolio-calculations.js";
import { adjustTransactionsForSplits, isBeforeSplit, splitFactorAt } from "../../../services/portfolio/splits/split-adjustment.js";

const buy = (tradedAt: string, quantity: number, price: number, fees = 0) => ({ type: "buy", quantity, price, total_fees: fees, traded_at: tradedAt });

test("a 10-for-1 split multiplies earlier quantities and divides their price, amounts unchanged", () => {
  const [adjusted] = adjustTransactionsForSplits([buy("2024-01-15T10:00:00.000Z", 3, 1200, 4)], [{ date: "2024-06-10", numerator: 10, denominator: 1 }]);
  assert.ok(adjusted);

  assert.deepEqual(
    { quantity: adjusted.quantity, price: adjusted.price, fees: adjusted.total_fees, factor: adjusted.splitFactor },
    { quantity: 30, price: 120, fees: 4, factor: 10 }
  );
  assert.equal(adjusted.quantity * adjusted.price, 3 * 1200);
});

test("successive splits are cumulated and a reverse split divides quantities", () => {
  const splits = [
    { date: "2020-08-31", numerator: 4, denominator: 1 },
    { date: "2024-06-10", numerator: 10, denominator: 1 },
    { date: "2025-03-01", numerator: 1, denominator: 10 }
  ];

  assert.equal(splitFactorAt("2019-05-01T09:00:00.000Z", splits), 4);
  assert.equal(splitFactorAt("2022-05-01T09:00:00.000Z", splits), 1);
  assert.equal(splitFactorAt("2025-01-01T09:00:00.000Z", splits), 0.1);
  assert.equal(splitFactorAt("2025-06-01T09:00:00.000Z", splits), 1);
});

test("a trade executed on the split day already uses post-split prices", () => {
  const split = { date: "2024-06-10" };

  assert.equal(isBeforeSplit("2024-06-10T07:30:00.000Z", split), false);
  assert.equal(isBeforeSplit("2024-06-09T21:59:00.000Z", split), true);
  assert.equal(isBeforeSplit("not a date", split), false);
  assert.equal(isBeforeSplit("2024-06-09T21:59:00.000Z", { date: "10/06/2024" }), false);
});

test("regression: a position bought before a 1:10 split is not valued at -90 %", () => {
  const rows = [buy("2024-01-15T10:00:00.000Z", 10, 1000), buy("2024-07-01T10:00:00.000Z", 5, 110)];
  const splits = [{ date: "2024-06-10", numerator: 10, denominator: 1 }];
  const priceAfterSplit = 110;

  const raw = replayTransactions(rows);
  const adjusted = replayTransactions(adjustTransactionsForSplits(rows, splits));

  assert.ok(raw.quantity * priceAfterSplit < raw.costBasis * 0.2, "without adjustment the position looks like it lost ~90 %");
  assert.equal(adjusted.quantity, 105);
  assert.equal(adjusted.costBasis, 10 * 1000 + 5 * 110);
  assert.ok(adjusted.quantity * priceAfterSplit > adjusted.costBasis);
});

test("without applied split the rows are returned untouched", () => {
  const rows = [buy("2024-01-15T10:00:00.000Z", 1, 10)];

  assert.equal(adjustTransactionsForSplits(rows, []), rows);
});
