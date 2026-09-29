import assert from "node:assert/strict";
import test from "node:test";
import type { AlertParams, AlertType } from "@pea/shared";
import { evaluateAlert, type AlertMarketContext, type AlertState } from "../../services/alerts/alert-evaluation.js";

const NOW = new Date("2026-09-29T10:00:00.000Z");

/** Évalue une suite d'observations en reportant l'état, comme le job live d'un rafraîchissement à l'autre. */
function run(type: AlertType, params: AlertParams, contexts: AlertMarketContext[], lastTriggeredAt?: string) {
  let state: AlertState = {};
  return contexts.map((context) => {
    const result = evaluateAlert({ type, params, state, lastTriggeredAt }, context, NOW);
    state = result.state;
    return result.event;
  });
}

test("a price threshold fires when crossed, once, and again only after going back", () => {
  const events = run("price_above", { threshold: 60 }, [{ price: 58 }, { price: 61 }, { price: 62 }, { price: 59 }, { price: 60 }]);
  assert.deepEqual(events.map(Boolean), [false, true, false, false, true]);
  assert.deepEqual(events[1], { price: 61, threshold: 60, currency: undefined });

  const below = run("price_below", { threshold: 50 }, [{ price: 49 }, { price: 48 }]);
  assert.deepEqual(below.map(Boolean), [true, false], "already below at the first observation fires once");
});

test("a daily change fires on an absolute move beyond the threshold", () => {
  assert.deepEqual(run("daily_change", { threshold: 5 }, [{ changePercent: 3 }, { changePercent: -6.2 }]).map(Boolean), [false, true]);
});

test("the 200-day moving average cross is detected in both directions and filtered by direction", () => {
  const path = [{ price: 90, ma200: 100 }, { price: 105, ma200: 100 }, { price: 99, ma200: 100 }];
  assert.deepEqual(run("ma200_cross", { direction: "both" }, path).map((event) => event?.crossed), [undefined, "up", "down"]);
  assert.deepEqual(run("ma200_cross", { direction: "down" }, path).map((event) => event?.crossed), [undefined, undefined, "down"]);
  assert.deepEqual(run("ma200_cross", {}, [{ price: 90 }, { price: 110, ma200: 100 }]).map(Boolean), [false, false], "no moving average: nothing to compare");
});

test("new 52-week highs and lows compare to the extreme seen at the previous evaluation", () => {
  const highs = run("new_52w_high", {}, [{ price: 95, fiftyTwoWeekHigh: 100 }, { price: 101, fiftyTwoWeekHigh: 101 }, { price: 100.5, fiftyTwoWeekHigh: 101 }]);
  assert.deepEqual(highs.map(Boolean), [false, true, false]);
  assert.equal(highs[1]?.previousHigh, 100);

  const lows = run("new_52w_low", {}, [{ price: 12, fiftyTwoWeekLow: 10 }, { price: 9.5, fiftyTwoWeekLow: 9.5 }]);
  assert.deepEqual(lows.map((event) => event?.previousLow), [undefined, 10]);
});

test("recommendation changes and newly announced ex-dividend dates fire, known values do not", () => {
  const consensus = run("recommendation_change", {}, [{ recommendationKey: "hold" }, { recommendationKey: "hold" }, { recommendationKey: "buy" }]);
  assert.deepEqual(consensus[2], { previousKey: "hold", recommendationKey: "buy" });
  assert.deepEqual(consensus.slice(0, 2).map(Boolean), [false, false]);

  const dividends = run("ex_dividend_announced", {}, [{}, { nextExDividendDate: "2026-11-02T00:00:00.000Z" }, { nextExDividendDate: "2026-11-02T00:00:00.000Z" }]);
  assert.deepEqual(dividends.map(Boolean), [false, true, false], "a date announced after the alert was created fires once");
  assert.deepEqual(run("ex_dividend_announced", {}, [{ nextExDividendDate: "2026-11-02T00:00:00.000Z" }]).map(Boolean), [false], "a date already known is not news");
});

test("the cooldown silences a trigger but still consumes the crossing", () => {
  const recent = "2026-09-29T02:00:00.000Z";
  const silenced = run("price_above", { threshold: 60 }, [{ price: 58 }, { price: 61 }], recent);
  assert.deepEqual(silenced.map(Boolean), [false, false], "8 hours after the last trigger, the 24 h cooldown applies");
  assert.deepEqual(run("price_above", { threshold: 60, cooldownHours: 4 }, [{ price: 58 }, { price: 61 }], recent).map(Boolean), [false, true]);
});
