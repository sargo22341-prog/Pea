import { describe, expect, it } from "vitest";
import {
  formatChange,
  formatMaybeMoney,
  formatMaybePercentYield,
  formatPlainPercent,
  formatRangeLabel,
  money,
  percent
} from "../lib/format";

describe("money", () => {
  it("formats positive integers as EUR with 2 decimals below 1000", () => {
    expect(money(100)).toMatch(/100/);
    expect(money(100)).toMatch(/€/);
  });

  it("formats zero as zero euros", () => {
    expect(money(0)).toMatch(/0/);
  });

  it("formats NaN as zero (does not throw)", () => {
    expect(() => money(NaN)).not.toThrow();
    expect(money(NaN)).toMatch(/0/);
  });

  it("formats Infinity as zero (does not throw)", () => {
    expect(() => money(Infinity)).not.toThrow();
  });

  it("formats large values without decimals (> 1000)", () => {
    const result = money(12345.67);
    expect(result).not.toMatch(/,\d{2}\s*€/);
  });

  it("supports non-EUR currency", () => {
    const result = money(50, "USD");
    expect(result).toMatch(/\$/);
  });
});

describe("percent", () => {
  it("adds + sign for positive values", () => {
    expect(percent(5.5)).toMatch(/^\+/);
  });

  it("keeps - sign for negative values", () => {
    expect(percent(-2)).toMatch(/-/);
  });

  it("formats zero with + sign (>= 0 condition includes zero)", () => {
    expect(percent(0)).toMatch(/%/);
  });

  it("appends % symbol", () => {
    expect(percent(10)).toMatch(/%/);
  });

  it("handles NaN without throwing", () => {
    expect(() => percent(NaN)).not.toThrow();
  });
});

describe("formatRangeLabel", () => {
  it("returns French label for 1d", () => {
    expect(formatRangeLabel("1d")).toBe("1 jour");
  });

  it("returns French label for all", () => {
    expect(formatRangeLabel("all")).toBe("Tout");
  });

  it("returns compact label when compact option is set", () => {
    expect(formatRangeLabel("1w", { compact: true })).toBe("1 sem.");
  });

  it("returns the raw string for unknown ranges", () => {
    expect(formatRangeLabel("unknown_range")).toBe("unknown_range");
  });

  it("is case-insensitive (uppercase input)", () => {
    expect(formatRangeLabel("1D")).toBe("1 jour");
  });
});

describe("formatChange", () => {
  it("returns n/a when both value and percent are undefined", () => {
    expect(formatChange(undefined, undefined, "EUR")).toBe("n/a");
  });

  it("returns n/a when both value and percent are non-finite", () => {
    expect(formatChange(NaN, NaN, "EUR")).toBe("n/a");
  });

  it("formats a positive change with n/a for missing percent", () => {
    const result = formatChange(10, undefined, "EUR");
    expect(result).toMatch(/\+/);
    expect(result).toMatch(/n\/a/);
  });

  it("formats both amount and percent when both provided", () => {
    const result = formatChange(10, 1.5, "EUR");
    expect(result).toMatch(/\+/);
    expect(result).toMatch(/%/);
  });
});

describe("formatMaybeMoney", () => {
  it("returns n/a when value is undefined", () => {
    expect(formatMaybeMoney(undefined, "EUR")).toBe("n/a");
  });

  it("returns n/a when value is NaN", () => {
    expect(formatMaybeMoney(NaN, "EUR")).toBe("n/a");
  });

  it("formats valid value", () => {
    expect(formatMaybeMoney(100, "EUR")).not.toBe("n/a");
    expect(formatMaybeMoney(100, "EUR")).toMatch(/100/);
  });
});

describe("formatMaybePercentYield", () => {
  it("returns n/a for undefined", () => {
    expect(formatMaybePercentYield(undefined)).toBe("n/a");
  });

  it("returns n/a for NaN", () => {
    expect(formatMaybePercentYield(NaN)).toBe("n/a");
  });

  it("formats Yahoo fraction yields", () => {
    const result = formatMaybePercentYield(0.035);
    expect(result).toMatch(/3/);
    expect(result).toMatch(/%/);
  });

  it("formats Yahoo percent yields without multiplying twice", () => {
    const result = formatMaybePercentYield(4.75);
    expect(result).toMatch(/4,75/);
    expect(result).not.toMatch(/475/);
  });

  it("returns n/a for aberrant yields", () => {
    expect(formatMaybePercentYield(475)).toBe("n/a");
  });
});

describe("formatPlainPercent", () => {
  it("returns n/a for undefined", () => {
    expect(formatPlainPercent(undefined)).toBe("n/a");
  });

  it("returns n/a for NaN", () => {
    expect(formatPlainPercent(NaN)).toBe("n/a");
  });

  it("formats number with 2 decimal places and % symbol", () => {
    const result = formatPlainPercent(45.678);
    expect(result).toMatch(/45/);
    expect(result).toMatch(/%/);
  });
});
