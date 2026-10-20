import type { PeaOverview, PortfolioSummary } from "@pea/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
  positions: [],
  yieldOnCost: 0.034
};

const pea: PeaOverview = {
  status: "ready",
  cash: 230,
  deposits: 1000,
  withdrawals: 100,
  netDeposits: 900,
  cashDividends: 30,
  standaloneFees: 0,
  depositCeiling: 150_000,
  remainingCeiling: 149_000,
  realizedGain: 200,
  historyIncomplete: false,
  positionsValue: 1200,
  totalValue: 1430,
  latentGain: 200,
  globalGain: 530,
  simpleReturnPercent: 58.89
};

function renderMetrics(value: PortfolioSummary, privacyEnabled = false) {
  return render(
    <MemoryRouter>
      <PrivacyContext.Provider value={{ privacyEnabled }}>
        <TopMetrics chart={null} chartLoading loading={false} range="1d" summary={value} />
      </PrivacyContext.Provider>
    </MemoryRouter>
  );
}

function metricValue(label: string) {
  return (screen.getByText(label).closest(".card")?.textContent ?? "").replace(label, "").replace(/\s/g, "");
}

describe("TopMetrics", () => {
  it("keeps the home page to the PEA value and four key indicators", () => {
    renderMetrics({ ...summary, pea });

    expect(screen.getByText((content) => content.replace(/\s/g, "") === "1430,00" || content.replace(/\s/g, "") === "1430")).toBeInTheDocument();
    expect(metricValue("Gain global")).toBe("530,00€(+58,89%)");
    expect(metricValue("Espèces disponibles")).toBe("230,00€");
    expect(metricValue("Versements cumulés")).toBe("1000,00€");
    expect(screen.getByText(/^Performance sur /)).toBeInTheDocument();
    expect(screen.queryByText("Rendement sur cout")).not.toBeInTheDocument();
    expect(screen.queryByText("Total frais")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voir mon PEA/ })).toHaveAttribute("href", "/pea");
  });

  it("falls back to position indicators while the cash account is not set up", () => {
    renderMetrics({ ...summary, pea: { ...pea, status: "pending" } });

    expect(metricValue("Performance")).toBe("200,00€(+20%)");
    expect(metricValue("Prix de revient des positions")).toBe("1000,00€");
    expect(screen.queryByText("Espèces disponibles")).not.toBeInTheDocument();
  });

  it("masks amounts in private mode", () => {
    renderMetrics({ ...summary, pea }, true);

    expect(metricValue("Gain global")).toBe("••••");
    expect(metricValue("Espèces disponibles")).toBe("••••");
  });
});
