import { describe, expect, it } from "vitest";
import { normalizeSeriesByPoints } from "../lib/seriesNormalization";

describe("normalizeSeriesByPoints", () => {
  it("converts each valid series to relative performance", () => {
    const [first, second] = normalizeSeriesByPoints([
      [
        { date: "2026-01-01T09:00:00.000Z", value: 100 },
        { date: "2026-01-01T10:00:00.000Z", value: 110 }
      ],
      [
        { date: "2026-01-01T15:30:00.000Z", value: 50 },
        { date: "2026-01-01T16:30:00.000Z", value: 45 }
      ]
    ]);

    expect(first.map((point) => point.value)).toEqual([0, 10]);
    expect(second.map((point) => point.value)).toEqual([0, -10]);
  });

  it("uses the shortest valid series length by default", () => {
    const [long, short] = normalizeSeriesByPoints([
      [
        { date: 0, value: 100 },
        { date: 10, value: 110 },
        { date: 20, value: 120 }
      ],
      [
        { date: 0, value: 50 },
        { date: 20, value: 55 }
      ]
    ]);

    expect(long).toHaveLength(2);
    expect(short).toHaveLength(2);
    expect(long.map((point) => point.value)).toEqual([0, 20]);
  });

  it("linearly interpolates value and date when resampling to a larger target", () => {
    const [series] = normalizeSeriesByPoints(
      [
        [
          { date: 0, value: 100 },
          { date: 20, value: 120 }
        ]
      ],
      3
    );

    expect(series.map((point) => point.value)).toEqual([0, 10, 20]);
    expect(series.map((point) => point.date)).toEqual([0, 10, 20]);
    expect(series[1].interpolated).toBe(true);
  });

  it("ignores null and undefined values", () => {
    const [series] = normalizeSeriesByPoints([
      [
        { date: 0, value: null },
        { date: 1, value: 100 },
        { date: 2 },
        { date: 3, value: 105 }
      ]
    ]);

    expect(series.map((point) => point.date)).toEqual([1, 3]);
    expect(series.map((point) => point.value)).toEqual([0, 5]);
  });

  it("returns an empty series when fewer than two valid points are available", () => {
    const [series] = normalizeSeriesByPoints([[{ date: 0, value: 100 }]]);

    expect(series).toEqual([]);
  });
});
