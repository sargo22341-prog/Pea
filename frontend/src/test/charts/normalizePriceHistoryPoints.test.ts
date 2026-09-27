import { describe, expect, it } from "vitest";
import { normalizePriceHistoryPoints } from "../../hooks/usePriceHistoryChart";

describe("normalizePriceHistoryPoints", () => {
  it("accepts numeric timestamps and ISO dates as the same instants", () => {
    const time = Date.parse("2026-07-01T08:00:00.000Z");
    const fromNumbers = normalizePriceHistoryPoints([{ date: time + 60_000, value: 11 }, { date: time, value: 10 }]);
    const fromStrings = normalizePriceHistoryPoints([
      { date: new Date(time + 60_000).toISOString(), value: 11 },
      { date: new Date(time).toISOString(), value: 10 }
    ]);

    expect(fromNumbers).toEqual([{ date: time, value: 10 }, { date: time + 60_000, value: 11 }]);
    expect(fromStrings).toEqual(fromNumbers);
  });

  it("drops invalid instants, keeps gaps as null and deduplicates the same instant", () => {
    const time = Date.parse("2026-07-01T08:00:00.000Z");
    const points = normalizePriceHistoryPoints([
      { date: "", value: 1 },
      { date: "not a date", value: 2 },
      { date: Number.NaN, value: 3 },
      { date: time, value: Number.POSITIVE_INFINITY },
      { date: new Date(time).toISOString(), value: 12 }
    ]);

    expect(points).toEqual([{ date: time, value: 12 }]);
    expect(normalizePriceHistoryPoints([{ date: time, value: null }])).toEqual([{ date: time, value: null }]);
  });
});
