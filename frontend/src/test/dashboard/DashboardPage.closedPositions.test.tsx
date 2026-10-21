import type { User } from "@pea/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../../pages/dashboard/DashboardPage";

const portfolioFull = vi.fn<(range: string) => Promise<unknown>>();

// Les autres blocs du tableau de bord ne sont pas l'objet du test : leurs appels restent en attente.
vi.mock("../../lib/api", () => ({
  api: new Proxy({}, {
    get: (_target, name) => name === "portfolioFull"
      ? (range: string) => portfolioFull(range)
      : () => new Promise(() => undefined)
  })
}));

const user = { id: 1, username: "tester", defaultChartRange: "1m", dashboardDefaultSortKey: "name", dashboardDefaultSortDirection: "asc", watchlistDefaultSortKey: "name", watchlistDefaultSortDirection: "asc", localPeaSearchEnabled: false } as unknown as User;

function summary(closedPositionsCount: number) {
  return {
    totalValue: 0,
    totalCost: 0,
    totalDividendsReceived: 12,
    totalFees: 0,
    totalPerformance: 0,
    totalPerformancePercent: 0,
    positionsCount: 0,
    assetsCount: 0,
    closedPositionsCount,
    currency: "EUR",
    positions: []
  };
}

const chart = { userId: "1", range: "1M", timestamps: [], value: [], invested: [], gain: [], gainPercent: [], performanceEuro: 0, performancePercent: 0, cachedAt: 0, expiresAt: 0, transactionMarkers: [] };

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage appTimezone="Europe/Paris" user={user} />
    </MemoryRouter>
  );
}

describe("DashboardPage with closed positions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the dashboard when every position has been sold", async () => {
    portfolioFull.mockResolvedValue({ summary: summary(1), chart });

    renderDashboard();

    expect(await screen.findByText(/Toutes vos positions sont soldées/)).toBeInTheDocument();
    expect(screen.queryByText("Ajoutez votre premiere ligne")).not.toBeInTheDocument();
  });

  it("still invites a new user to add a first position", async () => {
    portfolioFull.mockResolvedValue({ summary: summary(0), chart });

    renderDashboard();

    expect(await screen.findByText("Ajoutez votre premiere ligne")).toBeInTheDocument();
  });
});
