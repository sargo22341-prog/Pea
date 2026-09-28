import type { PortfolioDividendEvent } from "@pea/shared";
import { describe, expect, it } from "vitest";
import { dividendGrowthBySymbol, dividendStatusTotals } from "../../pages/dividends/utils/dividendInsights";

function event(overrides: Partial<PortfolioDividendEvent> & { date: string; year: number }): PortfolioDividendEvent {
  return { symbol: "AI.PA", name: "Air Liquide", amountPerShare: 1, quantity: 10, totalAmount: 10, currency: "EUR", status: "real", ...overrides };
}

describe("dividendGrowthBySymbol", () => {
  it("computes the growth of each asset from its real payments only", () => {
    const past = [2020, 2021, 2022, 2023, 2024, 2025].map((year, index) => event({ date: `${year}-05-15T00:00:00.000Z`, year, amountPerShare: 1 + index * 0.1 }));
    const growth = dividendGrowthBySymbol([...past, event({ date: "2025-11-15T00:00:00.000Z", year: 2025, amountPerShare: 50, status: "estimated" })], 2026);

    const airLiquide = growth.get("AI.PA");
    expect(airLiquide?.history.at(-1)).toEqual({ year: 2025, amountPerShare: 1.5 });
    expect(airLiquide?.growthRate).toBeCloseTo(1.5 ** (1 / 5) - 1, 10);
    expect(airLiquide?.aristocrat).toBe(true);
  });
});

describe("dividendStatusTotals", () => {
  it("splits the year total by reliability, projections counting as estimates", () => {
    const totals = dividendStatusTotals([
      event({ date: "2026-03-10T00:00:00.000Z", year: 2026, totalAmount: 10 }),
      event({ date: "2026-06-02T00:00:00.000Z", year: 2026, totalAmount: 24, status: "announced" }),
      event({ date: "2026-12-05T00:00:00.000Z", year: 2026, totalAmount: 7, status: "estimated" }),
      { ...event({ date: "2026-12-20T00:00:00.000Z", year: 2026, totalAmount: 3, status: "estimated" }), projected: true },
      event({ date: "2025-06-02T00:00:00.000Z", year: 2025, totalAmount: 99 })
    ], 2026);

    expect(totals).toEqual({ real: 10, announced: 24, estimated: 10 });
  });
});
