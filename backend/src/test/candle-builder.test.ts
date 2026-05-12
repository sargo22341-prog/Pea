import assert from "node:assert/strict";
import test from "node:test";
import { candleBuilder } from "../services/candles/candle.builder.js";
import { getLastTradingDay } from "../services/market/calendars/marketCalendar.service.js";

test("Tokyo intraday candles keep afternoon session and ignore lunch pause / after final close", () => {
  const candles = candleBuilder.buildCandles({
    assetId: 1,
    symbol: "7203.T",
    exchange: "JPX",
    range: "1d",
    interval: "5m",
    points: [
      { date: "2026-05-07T01:00:00.000Z", close: 100 }, // 10:00 Tokyo
      { date: "2026-05-07T02:30:00.000Z", close: 101 }, // 11:30 Tokyo
      { date: "2026-05-07T03:00:00.000Z", close: 102 }, // 12:00 Tokyo, lunch pause
      { date: "2026-05-07T04:00:00.000Z", close: 103 }, // 13:00 Tokyo
      { date: "2026-05-07T06:25:00.000Z", close: 104 }, // 15:25 Tokyo
      { date: "2026-05-07T06:40:00.000Z", close: 105 } // 15:40 Tokyo, after final close
    ]
  });

  assert.deepEqual(candles.map((candle) => candle.datetimeStart), [
    "2026-05-07T01:00:00.000Z",
    "2026-05-07T02:30:00.000Z",
    "2026-05-07T04:00:00.000Z",
    "2026-05-07T06:25:00.000Z"
  ]);
  assert.equal(candles.at(-1)?.close, 104);
});

test("Tokyo final market close is the last session close, not the lunch break", () => {
  const session = getLastTradingDay("7203.T", "JPX", new Date("2026-05-07T05:00:00.000Z")); // 14:00 Tokyo

  assert.equal(session.period1.toISOString(), "2026-05-07T00:00:00.000Z");
  assert.equal(session.period2.toISOString(), "2026-05-07T06:30:00.000Z");
});

test("Paris single-session intraday candles keep existing behavior", () => {
  const candles = candleBuilder.buildCandles({
    assetId: 1,
    symbol: "BNP.PA",
    exchange: "Paris",
    range: "1d",
    interval: "5m",
    points: [
      { date: "2026-05-07T07:00:00.000Z", close: 100 }, // 09:00 Paris
      { date: "2026-05-07T15:25:00.000Z", close: 101 }, // 17:25 Paris
      { date: "2026-05-07T15:40:00.000Z", close: 102 } // 17:40 Paris
    ]
  });

  assert.deepEqual(candles.map((candle) => candle.datetimeStart), [
    "2026-05-07T07:00:00.000Z",
    "2026-05-07T15:25:00.000Z"
  ]);
});
