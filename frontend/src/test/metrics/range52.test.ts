import { describe, expect, it } from "vitest";
import { RANGE52_HIGH_ZONE, RANGE52_LOW_ZONE, range52Position } from "../../components/common/metrics/range52";

describe("range52Position", () => {
  it("places the price in its 52-week range with a tone per zone", () => {
    expect(range52Position(100, 200, 190)).toEqual({ ratio: 0.9, tone: "green", distanceFromHigh: expect.closeTo(-0.05) as number });
    expect(range52Position(100, 200, 150)?.tone).toBe("amber");
    expect(range52Position(100, 200, 110)?.tone).toBe("red");
    expect(range52Position(100, 200, 100 + RANGE52_HIGH_ZONE * 100)?.tone).toBe("amber");
    expect(range52Position(100, 200, 100 + RANGE52_LOW_ZONE * 100)?.tone).toBe("amber");
  });

  it("clamps a price outside the range reported by Yahoo", () => {
    expect(range52Position(100, 200, 210)).toEqual({ ratio: 1, tone: "green", distanceFromHigh: 0 });
    expect(range52Position(100, 200, 90)?.ratio).toBe(0);
  });

  it("is absent without a usable range", () => {
    expect(range52Position(undefined, 200, 150)).toBeUndefined();
    expect(range52Position(100, undefined, 150)).toBeUndefined();
    expect(range52Position(100, 200, undefined)).toBeUndefined();
    expect(range52Position(200, 200, 200)).toBeUndefined();
    expect(range52Position(100, 200, Number.NaN)).toBeUndefined();
  });
});
