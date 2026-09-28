import assert from "node:assert/strict";
import test from "node:test";
import {
  ARISTOCRAT_MIN_YEARS,
  DIVIDEND_HISTORY_YEARS,
  annualDividendHistory,
  dividendGrowthRate,
  dividendIncreaseStreak,
  summarizeDividendGrowth
} from "@pea/shared";

const CURRENT_YEAR = 2026;
const paid = (year: number, amount: number, monthDay = "05-15") => ({ date: `${year}-${monthDay}T00:00:00.000Z`, amount });

test("annual history keeps complete calendar years only and fills years without payment", () => {
  const windowStartYear = CURRENT_YEAR - DIVIDEND_HISTORY_YEARS;
  const history = annualDividendHistory([
    paid(windowStartYear, 9, "11-20"),
    paid(2021, 1),
    paid(2021, 0.5, "11-15"),
    paid(2023, 2),
    paid(CURRENT_YEAR, 3)
  ], CURRENT_YEAR);

  assert.deepEqual(history, [
    { year: 2021, amountPerShare: 1.5 },
    { year: 2022, amountPerShare: 0 },
    { year: 2023, amountPerShare: 2 },
    { year: 2024, amountPerShare: 0 },
    { year: 2025, amountPerShare: 0 }
  ], "the partial first year of the window and the current year are excluded");
  assert.deepEqual(annualDividendHistory([paid(CURRENT_YEAR, 3)], CURRENT_YEAR), []);
});

test("five-year growth rate compares last year with five years earlier", () => {
  const history = annualDividendHistory([paid(2020, 1), paid(2021, 1.1), paid(2022, 1.2), paid(2023, 1.3), paid(2024, 1.4), paid(2025, 1.61051)], CURRENT_YEAR);

  const growth = dividendGrowthRate(history);
  assert.ok(growth !== undefined);
  assert.ok(Math.abs(growth - 0.1) < 1e-9);
});

test("a dividend cut last year gives a -100 % growth and breaks the streak", () => {
  const summary = summarizeDividendGrowth([paid(2020, 1), paid(2021, 1.1), paid(2022, 1.2), paid(2023, 1.3), paid(2024, 1.4)], CURRENT_YEAR);

  assert.equal(summary.history.at(-1)?.amountPerShare, 0);
  assert.equal(summary.growthRate, -1);
  assert.equal(summary.increaseStreak, 0);
  assert.equal(summary.aristocrat, false);
});

test("growth is unknown when the history does not reach five years back", () => {
  assert.equal(dividendGrowthRate(annualDividendHistory([paid(2022, 1), paid(2025, 2)], CURRENT_YEAR)), undefined);
  assert.equal(dividendGrowthRate([]), undefined);
});

test("the aristocrat badge needs consecutive strict increases up to last year", () => {
  const increases = Array.from({ length: ARISTOCRAT_MIN_YEARS + 1 }, (_, index) => paid(2025 - ARISTOCRAT_MIN_YEARS + index, 1 + index * 0.1));
  const aristocrat = summarizeDividendGrowth(increases, CURRENT_YEAR);
  assert.equal(aristocrat.increaseStreak, ARISTOCRAT_MIN_YEARS);
  assert.equal(aristocrat.aristocrat, true);

  const flatYear = summarizeDividendGrowth([...increases.slice(0, -1), paid(2025, 1 + (ARISTOCRAT_MIN_YEARS - 1) * 0.1)], CURRENT_YEAR);
  assert.equal(flatYear.increaseStreak, 0, "an unchanged dividend is not an increase");
  assert.equal(flatYear.aristocrat, false);
  assert.equal(dividendIncreaseStreak([{ year: 2024, amountPerShare: 0 }, { year: 2025, amountPerShare: 1 }]), 0, "resuming a dividend is not an increase");
});
