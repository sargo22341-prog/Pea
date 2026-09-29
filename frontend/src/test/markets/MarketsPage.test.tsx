import type { MarketListId, MarketListResponse, MarketOverviewItem, MarketOverviewResponse } from "@pea/shared";
import { MARKETS_REFRESH_INTERVAL_MS } from "@pea/shared";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketsPage } from "../../pages/markets/MarketsPage";

const marketOverview = vi.fn<() => Promise<MarketOverviewResponse>>();
const marketList = vi.fn<(id: MarketListId, peaOnly: boolean) => Promise<MarketListResponse>>();

vi.mock("../../lib/api", () => ({
  api: {
    marketOverview: () => marketOverview(),
    marketList: (id: MarketListId, peaOnly: boolean) => marketList(id, peaOnly)
  }
}));

function item(overrides: Partial<MarketOverviewItem>): MarketOverviewItem {
  return { symbol: "^FCHI", category: "indices", key: "cac40", price: 7500, changePercent: 0.5, currency: "EUR", sparkline: [{ t: 1, v: 1 }, { t: 2, v: 2 }], ...overrides };
}

function overview(cacPrice: number): MarketOverviewResponse {
  return {
    updatedAt: "2026-09-29T10:00:00.000Z",
    items: [item({ price: cacPrice }), item({ symbol: "GC=F", category: "commodities", key: "gold", price: 2400, currency: "USD", changePercent: -1 })]
  };
}

function list(id: MarketListId, peaOnly: boolean): MarketListResponse {
  const items = [
    { symbol: "TTE.PA", shortName: "TotalEnergies", price: 60, change: 1, changePercent: 1.5, currency: "EUR", trailingPE: 8.5, dividendYield: 0.052, marketCap: 140e9, peaEligible: true },
    { symbol: "AAPL", shortName: "Apple", price: 200, change: -1, changePercent: -0.5, currency: "USD", peaEligible: false }
  ];
  return { id, items: peaOnly ? [] : items, cachedAt: "", cacheDate: "", peaOnly };
}

function renderPage() {
  render(<MemoryRouter><MarketsPage /></MemoryRouter>);
}

describe("MarketsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    marketOverview.mockResolvedValue(overview(7500));
    marketList.mockImplementation((id, peaOnly) => Promise.resolve(list(id, peaOnly)));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows indices open and secondary families folded", async () => {
    renderPage();
    expect(await screen.findByText("CAC 40")).toBeInTheDocument();
    expect(screen.getByText("7 500,00")).toBeInTheDocument();
    expect(screen.queryByText("Or")).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Rechercher un actif" })).toHaveAttribute("href", "/search");

    fireEvent.click(screen.getByRole("button", { name: /Matieres premieres/ }));
    expect(screen.getByText("Or")).toBeInTheDocument();
  });

  it("refreshes quotes at the cache interval and flashes a moving value", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    renderPage();
    await screen.findByText("7 500,00");
    marketOverview.mockResolvedValue(overview(7510));

    act(() => { vi.advanceTimersByTime(MARKETS_REFRESH_INTERVAL_MS); });

    await waitFor(() => { expect(screen.getByText("7 510,00")).toHaveClass("motion-flash-up"); });
    expect(marketOverview).toHaveBeenCalledTimes(2);
  });

  it("loads the day gainers with valuation hints, then filters PEA assets", async () => {
    renderPage();
    expect(await screen.findByText("TotalEnergies")).toBeInTheDocument();
    expect(marketList).toHaveBeenCalledWith("day_gainers", false);
    expect(screen.getByText(/PER 8\.5 · Rdt \+5,2 % · Cap\. 140/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "PEA uniquement" }));
    expect(await screen.findByText("Aucun titre eligible au PEA dans cette liste.")).toBeInTheDocument();
    expect(marketList).toHaveBeenLastCalledWith("day_gainers", true);
    expect(localStorage.getItem("pea.markets.peaOnly")).toBe("true");
  });

  it("keeps extra lists folded under a disclosure button", async () => {
    renderPage();
    await screen.findByText("TotalEnergies");
    expect(screen.queryByRole("tab", { name: "Croissance technologique" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Plus de listes" }));
    fireEvent.click(screen.getByRole("tab", { name: "Croissance technologique" }));
    await screen.findByText("TotalEnergies");
    expect(marketList).toHaveBeenLastCalledWith("growth_technology_stocks", false);
  });
});
