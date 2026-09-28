import type { PositionWithMarket } from "@pea/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyContext } from "../../contexts/privacy-context";
import { api } from "../../lib/api";
import { PositionList } from "../../pages/dashboard/components/PositionList";

vi.mock("../../lib/api", () => ({
  api: {
    positionsPerformance: vi.fn(),
    splits: vi.fn()
  }
}));

class ImmediateIntersectionObserver {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  disconnect() {
    // Aucun observateur réel à libérer dans ce double de test.
  }
  unobserve() {
    // Les cibles ne sont pas suivies : rien à retirer.
  }
  takeRecords() {
    return [];
  }
}

const basePosition: PositionWithMarket = {
  id: 1,
  symbol: "AI.PA",
  name: "AIR LIQUIDE",
  quantity: 4,
  averageBuyPrice: 150,
  currency: "EUR",
  createdAt: "2026-01-01T00:00:00.000Z",
  currentPrice: 170,
  marketValue: 680,
  costBasis: 600,
  performance: 80,
  performancePercent: 13.33
};

const signals = {
  yieldOnCost: 0.05,
  fiftyTwoWeekLow: 120,
  fiftyTwoWeekHigh: 200,
  consensusChange: { from: "hold", to: "buy", changedAt: "2026-09-20T08:00:00.000Z" }
};

function rangePerformance() {
  return {
    ...basePosition,
    currentMarketValue: 680,
    intervalStartPrice: 160,
    intervalStartMarketValue: 640,
    intervalPerformanceValue: 40,
    intervalPerformancePercent: 6.25,
    totalPerformanceValue: 80,
    totalPerformancePercent: 13.33,
    miniChart: { range: "1d", points: [{ t: 1_000, v: 640 }, { t: 2_000, v: 680 }] }
  };
}

function renderList(position: PositionWithMarket, privacyEnabled = false) {
  return render(
    <PrivacyContext.Provider value={{ privacyEnabled }}>
      <MemoryRouter>
        <PositionList positions={[position]} range="1d" />
      </MemoryRouter>
    </PrivacyContext.Provider>
  );
}

describe("dashboard position signals", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);
    vi.mocked(api.positionsPerformance).mockResolvedValue([rangePerformance()] as never);
    vi.mocked(api.splits).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the yield on cost, the 52-week gauge and the consensus change", async () => {
    renderList({ ...basePosition, ...signals });

    expect((await screen.findAllByText(/Rdt\/cout 5,0 %/)).length).toBeGreaterThan(0);
    const gauges = screen.getAllByRole("img", { name: /Fourchette 52 semaines/ });
    expect(gauges[0]).toHaveAccessibleName(/120,00.*200,00.*15,0 % sous le plus haut/);
    expect(screen.getAllByRole("img", { name: /Consensus des analystes passe de Conserver a Acheter le 20\/09\/2026/ }).length).toBeGreaterThan(0);
  });

  it("masks the yield on cost in private mode", async () => {
    renderList({ ...basePosition, ...signals }, true);

    expect((await screen.findAllByText(/Rdt\/cout ••••/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/5,0 %/)).not.toBeInTheDocument();
  });

  it("shows no signal when none is known", async () => {
    renderList(basePosition);

    await screen.findAllByText("AIR LIQUIDE");
    expect(screen.queryByText(/Rdt\/cout/)).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Fourchette 52 semaines/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Consensus des analystes/ })).not.toBeInTheDocument();
  });
});
