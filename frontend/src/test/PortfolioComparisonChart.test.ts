import { describe, expect, it } from "vitest";
import type { PortfolioChartDto } from "@pea/shared";
import { buildComparisonData, findClosestPrice } from "../components/charts/PortfolioComparisonChart";

function chart(): PortfolioChartDto {
  return {
    range: "1Y",
    timestamps: [
      Date.parse("2026-01-01T00:00:00.000Z"),
      Date.parse("2026-01-02T00:00:00.000Z")
    ],
    value: [1000, 1100],
    invested: [1000, 1000],
    gain: [0, 100],
    gainPercent: [0, 10],
    userId: "1",
    performanceEuro: 100,
    performancePercent: 10,
    transactionMarkers: [],
    cachedAt: Date.now(),
    expiresAt: Date.now()
  };
}

describe("PortfolioComparisonChart data", () => {
  it("keeps prices aligned with timestamps after sorting unordered comparison series", () => {
    const rows = buildComparisonData(
      chart(),
      [{
        key: "asset",
        label: "Asset",
        timestamps: [
          Date.parse("2026-01-02T00:00:00.000Z"),
          Date.parse("2026-01-01T00:00:00.000Z")
        ],
        prices: [220, 200]
      }],
      "1y"
    );

    expect(rows.map((row) => row.comparison_0)).toEqual([100, expect.closeTo(110)]);
  });

  it("ignores missing prices without shifting later timestamp/price pairs", () => {
    const rows = buildComparisonData(
      chart(),
      [{
        key: "asset",
        label: "Asset",
        timestamps: [
          Date.parse("2026-01-01T00:00:00.000Z"),
          Date.parse("2026-01-01T12:00:00.000Z"),
          Date.parse("2026-01-02T00:00:00.000Z")
        ],
        prices: [200, undefined as unknown as number, 240]
      }],
      "1y"
    );

    expect(rows.map((row) => row.comparison_0)).toEqual([100, 120]);
  });

  it("finds the closest price from sorted timestamp/price pairs", () => {
    expect(findClosestPrice([
      { timestamp: 10, price: 100 },
      { timestamp: 20, price: 110 },
      { timestamp: 30, price: 120 }
    ], 22, 5)).toBe(110);
  });
});
