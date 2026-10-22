import assert from "node:assert/strict";
import test from "node:test";
import { annualizedReturnPercent, periodReturn, type ReturnFlow } from "../../../services/portfolio/returns/period-returns.js";

const day = 24 * 60 * 60 * 1000;
const start = Date.parse("2025-01-01T00:00:00.000Z");
const end = start + 360 * day;

test("a late purchase weighs in proportion to the time it was invested", () => {
  // 1 000 € investis depuis le début, 9 000 € ajoutés au dernier dixième de l'année, gain de 100 €.
  const flows: ReturnFlow[] = [{ timeMs: start + 324 * day, kind: "buy", amount: 9000 }];
  const result = periodReturn({ startMs: start, endMs: end, startValue: 1000, endValue: 10_100 }, flows);

  assert.equal(result.invested, 9000);
  assert.equal(result.capitalGain, 100);
  // Capital moyen : 1 000 + 9 000 × 36/360 = 1 900 € ; un rendement simple aurait donné 1 %.
  assert.ok(Math.abs((result.returnPercent ?? 0) - (100 / 1900) * 100) < 1e-9);
});

test("sales and dividends withdraw capital and dividends count in the gain", () => {
  const flows: ReturnFlow[] = [
    { timeMs: start + 180 * day, kind: "sell", amount: 600 },
    { timeMs: start + 180 * day, kind: "dividend", amount: 40 },
    // Hors période : ignoré.
    { timeMs: end + 1, kind: "buy", amount: 5000 }
  ];
  const result = periodReturn({ startMs: start, endMs: end, startValue: 1000, endValue: 500 }, flows);

  assert.deepEqual({ invested: result.invested, sold: result.sold, dividends: result.dividends, capitalGain: result.capitalGain, gain: result.gain }, {
    invested: 0, sold: 600, dividends: 40, capitalGain: 100, gain: 140
  });
  // Capital moyen : 1 000 - 640 × 1/2 = 680 €.
  assert.ok(Math.abs((result.returnPercent ?? 0) - (140 / 680) * 100) < 1e-9);
});

test("no return is given when no capital was engaged", () => {
  const result = periodReturn({ startMs: start, endMs: end, startValue: 0, endValue: 0 }, []);
  assert.equal(result.returnPercent, undefined);
  assert.equal(result.gain, 0);
});

test("the annualized return accounts for each purchase date", () => {
  const twoYears = 2 * 365.25 * day;
  // 1 000 € placés deux ans à 10 % par an valent 1 210 €.
  const single = annualizedReturnPercent([{ timeMs: start, kind: "buy", amount: 1000 }], 1210, start + twoYears);
  assert.ok(Math.abs((single ?? 0) - 10) < 1e-6);

  // Même gain, mais la moitié du capital n'a été investie qu'un an : le taux annuel est plus élevé
  // qu'un gain total rapporté à la durée depuis le premier achat.
  const staggered = annualizedReturnPercent([
    { timeMs: start, kind: "buy", amount: 500 },
    { timeMs: start + twoYears / 2, kind: "buy", amount: 500 }
  ], 1210, start + twoYears);
  assert.ok((staggered ?? 0) > 13);
});

test("the annualized return is withheld under 90 days of history", () => {
  assert.equal(annualizedReturnPercent([{ timeMs: start, kind: "buy", amount: 1000 }], 1100, start + 30 * day), undefined);
});
