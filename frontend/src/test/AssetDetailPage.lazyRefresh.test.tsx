import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetDetailPage } from "../pages/AssetDetailPage";
import { api } from "../lib/api";

vi.mock("../components/charts/PriceHistoryChart", () => ({
  PriceHistoryChart: () => <div>price-chart</div>,
  ComparisonChart: () => <div>comparison-chart</div>
}));

vi.mock("../components/common/AssetCalendarEvents", () => ({
  AssetCalendarEvents: () => null
}));

vi.mock("../lib/api", () => ({
  api: {
    asset: vi.fn(),
    requestChartRefresh: vi.fn(),
    dataConstructionStatus: vi.fn(),
    deletePosition: vi.fn(),
    addWatchlist: vi.fn(),
    removeWatchlist: vi.fn()
  }
}));

vi.mock("../hooks/useAssetComparisonSeries", () => ({
  useAssetComparisonSeries: () => ({ series: [], loading: false })
}));

const user = {
  id: 1,
  username: "alice",
  role: "user",
  defaultChartRange: "1d",
  assetNewsEnabled: false,
  localPeaSearchEnabled: true,
  newsLanguageFrEnabled: true,
  newsLanguageEnEnabled: false,
  dashboardDefaultSortKey: "name",
  dashboardDefaultSortDirection: "asc"
} as const;

function assetDto(version = 1) {
  return {
    appTimezone: "Europe/Paris",
    quote: {
      symbol: "ASML.AS",
      name: "ASML",
      price: 100,
      currency: "EUR",
      exchange: "Amsterdam",
      marketState: "REGULAR"
    },
    marketInfo: { regularMarketPrice: 100, marketState: "REGULAR" },
    chart: {
      symbol: "ASML.AS",
      range: "1d",
      interval: "5m",
      timestamps: [1_000, 2_000 + version],
      prices: [99, 100 + version],
      cachedAt: Date.now(),
      expiresAt: Date.now() + 60_000
    },
    dividends: [],
    news: [],
    position: null,
    positionStats: null,
    marketSession: null,
    isInWatchlist: false,
    stale: false,
    peaEligibility: { status: "unknown" },
    isEtf: false,
    financials: [],
    analystConsensus: null,
    fundDetails: null
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/assets/ASML.AS"]}>
      <Routes>
        <Route path="/assets/:symbol" element={<AssetDetailPage user={user as never} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("AssetDetailPage lazy chart refresh", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not post chart-refresh in a loop when backend reports skipped-fresh", async () => {
    vi.mocked(api.asset).mockResolvedValue(assetDto() as never);
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "skipped-fresh" });

    renderPage();

    await screen.findByText("ASML");
    await waitFor(() => expect(api.requestChartRefresh).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(api.asset).toHaveBeenCalledTimes(1);
    expect(api.requestChartRefresh).toHaveBeenCalledTimes(1);
  });

  it("handles SSE updated with one refetch and no immediate repost", async () => {
    vi.mocked(api.asset)
      .mockResolvedValueOnce(assetDto(1) as never)
      .mockResolvedValueOnce(assetDto(2) as never);
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "started" });

    renderPage();

    await screen.findByText("ASML");
    await waitFor(() => expect(api.requestChartRefresh).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new CustomEvent("pea:market-event", {
      detail: { type: "asset-chart-updated", symbol: "ASML.AS", range: "1d", updatedAt: new Date().toISOString() }
    }));

    await waitFor(() => expect(api.asset).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(api.requestChartRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not repost while backend says refresh is already in progress", async () => {
    vi.mocked(api.asset).mockResolvedValue(assetDto() as never);
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "in-progress" });

    renderPage();

    await screen.findByText("ASML");
    await waitFor(() => expect(api.requestChartRefresh).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new CustomEvent("pea:market-event", {
      detail: { type: "asset-chart-refresh-started", symbol: "ASML.AS", range: "1d", startedAt: new Date().toISOString() }
    }));
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(api.requestChartRefresh).toHaveBeenCalledTimes(1);
  });
});
