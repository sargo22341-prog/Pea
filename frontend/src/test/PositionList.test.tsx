import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionList } from "../components/dashboard/PositionList";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    positionsPerformance: vi.fn()
  }
}));

class ImmediateIntersectionObserver {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

const basePosition = {
  id: 1,
  symbol: "AI.PA",
  name: "AIR LIQUIDE",
  quantity: 4,
  averageBuyPrice: 183.2,
  currency: "EUR",
  createdAt: "2026-01-01T00:00:00.000Z",
  currentPrice: 535.5,
  marketValue: 2142,
  costBasis: 732.8,
  performance: 1409.2,
  performancePercent: 192.31
};

function performance(range = "1d", lastValue = 2142) {
  return {
    ...basePosition,
    currentMarketValue: lastValue,
    intervalStartPrice: 500,
    intervalStartMarketValue: 2000,
    intervalPerformanceValue: lastValue - 2000,
    intervalPerformancePercent: ((lastValue - 2000) / 2000) * 100,
    totalPerformanceValue: 1409.2,
    totalPerformancePercent: 192.31,
    miniChart: {
      range,
      points: [
        { t: 1_000, v: 2000 },
        { t: 2_000, v: lastValue }
      ],
      updatedAt: "2026-05-06T12:00:00.000Z"
    }
  };
}

function renderList(range: "1d" | "1w" = "1d") {
  return render(
    <MemoryRouter>
      <PositionList positions={[basePosition]} range={range} />
    </MemoryRouter>
  );
}

describe("PositionList mini charts", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the compact position structure with an SVG sparkline", async () => {
    vi.mocked(api.positionsPerformance).mockResolvedValue([performance()] as never);

    renderList();

    await screen.findByText("AIR LIQUIDE");
    expect(screen.getAllByText(/4 x 183,20/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Quantite")).not.toBeInTheDocument();
    expect(screen.queryByText("Prix actuel")).not.toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /mini-graph 1d/i }).length).toBeGreaterThan(0);
  });

  it("refetches the current range on SSE portfolio updates without changing page state", async () => {
    vi.mocked(api.positionsPerformance)
      .mockResolvedValueOnce([performance("1w", 2100)] as never)
      .mockResolvedValueOnce([performance("1w", 2200)] as never);

    renderList("1w");
    await screen.findByText("AIR LIQUIDE");

    window.dispatchEvent(new CustomEvent("pea:market-event", {
      detail: { type: "portfolio-chart-updated", range: "1w", updatedAt: "2026-05-06T12:00:00.000Z" }
    }));

    await waitFor(() => expect(api.positionsPerformance).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.positionsPerformance).mock.calls.some((call) => call[0] === "1w" && call.length === 1)).toBe(true);
    expect((await screen.findAllByText(/2.?200/)).length).toBeGreaterThan(0);
  });

  it("shows a discrete placeholder when miniChart has no points", async () => {
    vi.mocked(api.positionsPerformance).mockResolvedValue([{ ...performance(), miniChart: { range: "1d", points: [] } }] as never);

    renderList();

    expect((await screen.findAllByLabelText("Mini-graph indisponible")).length).toBeGreaterThan(0);
  });
});
