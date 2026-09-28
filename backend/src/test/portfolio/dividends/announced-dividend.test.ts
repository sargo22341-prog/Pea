import assert from "node:assert/strict";
import test from "node:test";
import { PAYMENT_MATCH_WINDOW_DAYS, withAnnouncedDividend, type DatedAmount } from "../../../services/portfolio/dividends/announced-dividend.js";

type Event = DatedAmount & { status: "estimated" | "announced" };
const estimate = (date: string, amountPerShare: number): Event => ({ date: `${date}T00:00:00.000Z`, amountPerShare, status: "estimated" });
const announced = (date: string, amountPerShare: number): Event => ({ date, amountPerShare, status: "announced" });

test("an announced ex-date replaces the matching estimate, keeping the interim/final proportion", () => {
  const events = withAnnouncedDividend(
    [estimate("2026-06-05", 2), estimate("2026-12-05", 1)],
    { exDividendDate: "2026-06-02T00:00:00.000Z", annualDividendRate: 3.6, trailingYearPayments: [2, 1] },
    announced
  );

  assert.deepEqual(events.map((event) => [event.date.slice(0, 10), event.status, Number(event.amountPerShare.toFixed(6))]), [
    ["2026-06-02", "announced", 2.4],
    ["2026-12-05", "estimated", 1]
  ]);
});

test("an announcement without matching estimate is added with an even share of the annual dividend", () => {
  const events = withAnnouncedDividend(
    [estimate("2026-03-10", 0.5)],
    { exDividendDate: "2026-09-10T00:00:00.000Z", annualDividendRate: 2, trailingYearPayments: [0.5, 0.5, 0.5, 0.5] },
    announced
  );

  assert.deepEqual(events.map((event) => [event.status, event.amountPerShare]), [["estimated", 0.5], ["announced", 0.5]]);
});

test("a quarterly neighbour outside the matching window is never replaced", () => {
  const outside = new Date(Date.parse("2026-06-01T00:00:00.000Z") + (PAYMENT_MATCH_WINDOW_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
  const events = withAnnouncedDividend(
    [estimate(outside, 1)],
    { exDividendDate: "2026-06-01T00:00:00.000Z", annualDividendRate: 4, trailingYearPayments: [] },
    announced
  );

  assert.deepEqual(events.map((event) => [event.status, event.amountPerShare]), [["announced", 4], ["estimated", 1]]);
});

test("an announcement without usable annual dividend leaves the estimates untouched", () => {
  const estimates = [estimate("2026-06-05", 2)];
  assert.deepEqual(withAnnouncedDividend(estimates, { exDividendDate: "2026-06-02T00:00:00.000Z", annualDividendRate: 0, trailingYearPayments: [2] }, announced), estimates);
});
