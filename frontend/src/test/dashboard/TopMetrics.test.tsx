import type { PortfolioSummary } from "@pea/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyContext } from "../../contexts/privacy-context";
import { TopMetrics } from "../../pages/dashboard/components/TopMetrics";

const summary: PortfolioSummary = {
  totalValue: 1200,
  totalCost: 1000,
  totalDividendsReceived: 30,
  totalFees: 4,
  totalPerformance: 200,
  totalPerformancePercent: 20,
  positionsCount: 10,
  assetsCount: 2,
  currency: "EUR",
  positions: []
};

function renderMetrics(value: PortfolioSummary, privacyEnabled = false) {
  return render(
    <PrivacyContext.Provider value={{ privacyEnabled }}>
      <TopMetrics chart={null} chartLoading loading={false} range="1d" summary={value} />
    </PrivacyContext.Provider>
  );
}

describe("TopMetrics yield on cost", () => {
  it("shows the weighted yield on cost of the portfolio", () => {
    renderMetrics({ ...summary, yieldOnCost: 0.034 });

    expect(screen.getByText("Rendement sur cout")).toBeInTheDocument();
    expect(screen.getByText("3,4 %")).toBeInTheDocument();
  });

  it("masks the yield on cost in private mode", () => {
    renderMetrics({ ...summary, yieldOnCost: 0.034 }, true);

    expect(screen.getByText("Rendement sur cout")).toBeInTheDocument();
    expect(screen.queryByText("3,4 %")).not.toBeInTheDocument();
  });

  it("hides the tile when no position pays a known dividend", () => {
    renderMetrics(summary);

    expect(screen.queryByText("Rendement sur cout")).not.toBeInTheDocument();
  });
});
