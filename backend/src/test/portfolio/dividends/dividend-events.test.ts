import assert from "node:assert/strict";
import test from "node:test";
import type { DividendEvent, PositionWithMarket } from "@pea/shared";
import { ESTIMATE_PAST_GRACE_DAYS, upcomingDividendEvents, type PositionDividendInput } from "../../../services/portfolio/dividends/dividend-events.js";

const NOW = new Date("2026-09-28T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const position = {
  id: 1,
  symbol: "TTE.PA",
  name: "TotalEnergies",
  quantity: 10,
  averageBuyPrice: 50,
  currency: "EUR",
  createdAt: "2024-01-01T00:00:00.000Z",
  currentPrice: 60,
  marketValue: 600,
  costBasis: 500,
  performance: 100,
  performancePercent: 20
} satisfies PositionWithMarket;

function paid(date: string, amount: number): DividendEvent {
  return { symbol: "TTE.PA", date: `${date}T00:00:00.000Z`, amount, currency: "EUR", status: "real" };
}

function input(overrides: Partial<PositionDividendInput>): PositionDividendInput {
  return { position, dividends: [], metrics: {}, quantityAt: () => 10, now: NOW, ...overrides };
}

const summary = (events: ReturnType<typeof upcomingDividendEvents>) => events.map((event) => [event.date.slice(0, 10), event.status, Number(event.amountPerShare.toFixed(4))]);

test("a quarterly payer with five calendar-year payments is neither duplicated nor mis-scaled", () => {
  // Détachements réels de TotalEnergies : 2025 compte deux versements de janvier (02/01 et 31/12).
  const dividends = [
    paid("2025-01-02", 0.79), paid("2025-03-26", 0.79), paid("2025-06-19", 0.85), paid("2025-10-01", 0.85), paid("2025-12-31", 0.85),
    paid("2026-03-31", 0.85), paid("2026-06-30", 0.85)
  ];

  const events = upcomingDividendEvents(input({
    dividends,
    metrics: { annualDividendRate: 3.6 },
    nextExDividendDate: "2026-09-30T00:00:00.000Z"
  }));

  assert.deepEqual(summary(events), [
    ["2026-09-30", "announced", 0.9],
    ["2026-12-31", "estimated", 0.85]
  ], "the 2026-01-02 estimate was paid on 2025-12-31 and the announcement is scaled on the last twelve months");
});

test("an estimate past its date without any payment is no longer presented as upcoming", () => {
  // Stellantis : dividende d'avril 2025 non reconduit en 2026.
  const events = upcomingDividendEvents(input({ dividends: [paid("2025-04-22", 0.68)], metrics: { annualDividendRate: 0 } }));

  assert.deepEqual(events, []);
});

test("a just-missed estimate stays visible until the daily dividend refresh records the payment", () => {
  const recent = new Date(NOW.getTime() - (ESTIMATE_PAST_GRACE_DAYS - 2) * DAY_MS);
  recent.setFullYear(recent.getFullYear() - 1);
  const events = upcomingDividendEvents(input({ dividends: [paid(recent.toISOString().slice(0, 10), 1.2)] }));

  assert.deepEqual(events.map((event) => event.status), ["estimated"]);
});

test("without history nor announcement, the annual dividend is placed at year end", () => {
  const events = upcomingDividendEvents(input({ position: { ...position, estimatedAnnualDividend: 36 } }));

  const [event] = events;
  assert.ok(event);
  const localDate = new Date(event.date);
  assert.deepEqual([localDate.getFullYear(), localDate.getMonth(), localDate.getDate()], [2026, 11, 31], "placed on December 31 in the server time zone");
  assert.deepEqual([event.status, event.amountPerShare, event.totalAmount], ["estimated", 3.6, 36]);
});
