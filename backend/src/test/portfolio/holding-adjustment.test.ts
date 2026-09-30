import assert from "node:assert/strict";
import test from "node:test";
import { holdingAdjustments, type HoldingAdjustment } from "../../services/portfolio/holdings/holding-adjustment.js";
import { replayTransactions, type ReplayedHolding } from "../../services/portfolio/portfolio-calculations.js";

function replayWith(current: ReplayedHolding, adjustments: HoldingAdjustment[]) {
  const seed = current.quantity > 0 ? [{ type: "buy", quantity: current.quantity, price: 0, total_fees: current.costBasis }] : [];
  return replayTransactions([...seed, ...adjustments]);
}

function assertReaches(current: ReplayedHolding, target: { quantity: number; averageBuyPrice: number }) {
  const adjustments = holdingAdjustments(current, target);
  const replayed = replayWith(current, adjustments);
  assert.ok(Math.abs(replayed.quantity - target.quantity) < 1e-9, `quantity ${replayed.quantity} != ${target.quantity}`);
  if (target.quantity > 0) assert.ok(Math.abs(replayed.costBasis / replayed.quantity - target.averageBuyPrice) < 1e-9);
  for (const adjustment of adjustments) {
    assert.ok(adjustment.quantity > 0 && adjustment.price >= 0, "adjustments are valid transactions");
  }
  return adjustments;
}

test("unchanged holding needs no adjustment", () => {
  assert.deepEqual(holdingAdjustments({ quantity: 10, costBasis: 1000 }, { quantity: 10, averageBuyPrice: 100 }), []);
  assert.deepEqual(holdingAdjustments({ quantity: 0, costBasis: 0 }, { quantity: 0, averageBuyPrice: 50 }), []);
});

test("a larger holding is reached with a single buy at the implied price", () => {
  const adjustments = assertReaches({ quantity: 10, costBasis: 1000 }, { quantity: 15, averageBuyPrice: 101 });
  assert.deepEqual(adjustments, [{ type: "buy", quantity: 5, price: 103 }]);
});

test("a new holding is a single buy at the target average price", () => {
  assert.deepEqual(assertReaches({ quantity: 0, costBasis: 0 }, { quantity: 50, averageBuyPrice: 42 }), [{ type: "buy", quantity: 50, price: 42 }]);
});

test("a smaller holding at the same average price is a sale at the current average cost", () => {
  assert.deepEqual(assertReaches({ quantity: 10, costBasis: 1000 }, { quantity: 4, averageBuyPrice: 100 }), [{ type: "sell", quantity: 6, price: 100 }]);
  assert.deepEqual(assertReaches({ quantity: 10, costBasis: 1000 }, { quantity: 0, averageBuyPrice: 0 }), [{ type: "sell", quantity: 10, price: 100 }]);
});

test("an average price change that no buy can explain resets the line", () => {
  const sameQuantity = assertReaches({ quantity: 10, costBasis: 1000 }, { quantity: 10, averageBuyPrice: 80 });
  assert.deepEqual(sameQuantity, [{ type: "sell", quantity: 10, price: 100 }, { type: "buy", quantity: 10, price: 80 }]);
  const impliedNegativePrice = assertReaches({ quantity: 10, costBasis: 1000 }, { quantity: 11, averageBuyPrice: 50 });
  assert.equal(impliedNegativePrice.length, 2);
  const reducedWithNewPrice = assertReaches({ quantity: 10, costBasis: 1000 }, { quantity: 5, averageBuyPrice: 120 });
  assert.equal(reducedWithNewPrice.length, 2);
});
