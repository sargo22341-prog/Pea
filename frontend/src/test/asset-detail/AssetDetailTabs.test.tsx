import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { baseAssetDto, renderAssetPage } from "./assetPageFixture";

vi.mock("../../components/charts/PriceHistoryChart", () => ({
  PriceHistoryChart: () => <div>price-chart</div>,
  ComparisonChart: () => <div>comparison-chart</div>
}));
vi.mock("../../components/charts/financial/DividendLineChartSection", () => ({
  DividendLineChartSection: () => <div>dividend-chart</div>
}));
vi.mock("../../components/charts/financial/FinancialComboChart", () => ({
  FinancialComboChart: () => <div>financial-chart</div>
}));
vi.mock("../../components/charts/allocation/SectorAllocationChart", () => ({
  SectorAllocationChart: () => <div>sector-allocation-chart</div>
}));
vi.mock("../../components/common/AssetCalendarEvents", () => ({
  AssetCalendarEvents: ({ symbol }: { symbol: string }) => <div>calendar-events-{symbol}</div>
}));
vi.mock("../../lib/api", () => ({
  api: { asset: vi.fn(), requestChartRefresh: vi.fn(), splits: vi.fn() }
}));
vi.mock("../../hooks/useAssetComparisonSeries", () => ({
  useAssetComparisonSeries: () => ({ series: [], loading: false, preparingSymbols: [] })
}));

const dividend = { symbol: "X", date: "2026-05-01T00:00:00.000Z", amount: 1, currency: "EUR", status: "real" };

describe("asset page tabs", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("organizes an ETF that is not in the portfolio into overview, composition and dividends tabs", async () => {
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "skipped-fresh" });
    vi.mocked(api.splits).mockResolvedValue([]);
    vi.mocked(api.asset).mockResolvedValue({
      ...baseAssetDto("CW8.PA", "MSCI World"),
      isEtf: true,
      dividends: [dividend],
      financials: [{ year: 2025, revenue: 100, netIncome: 12, netMargin: 12 }],
      analystConsensus: { currentPrice: 100, targetMedianPrice: 120, recommendationMean: 2, recommendationKey: "buy", numberOfAnalystOpinions: 8 },
      fundDetails: { family: "ETF issuer", annualReportExpenseRatio: 0.0012, totalNetAssets: 1234, sectorWeightings: [{ key: "technology", value: 0.4 }] }
    } as never);

    renderAssetPage("CW8.PA");
    await screen.findByText("MSCI World");
    expect(screen.getByText("calendar-events-CW8.PA")).toBeInTheDocument();
    expect(screen.getByText("ETF issuer")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Apercu", "Composition", "Dividendes"]);

    fireEvent.click(screen.getByRole("tab", { name: "Composition" }));
    expect(await screen.findByText("sector-allocation-chart")).toBeInTheDocument();
    expect(screen.queryByText("calendar-events-CW8.PA")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("?tab=composition");

    fireEvent.click(screen.getByRole("tab", { name: "Dividendes" }));
    expect(await screen.findByText("dividend-chart")).toBeInTheDocument();
  });

  it("opens the tab named in the URL and falls back to the overview when it has no data", async () => {
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "skipped-fresh" });
    vi.mocked(api.splits).mockResolvedValue([]);
    vi.mocked(api.asset).mockResolvedValue({
      ...baseAssetDto("MC.PA", "LVMH"),
      financials: [{ year: 2025, revenue: 100, netIncome: 12, netMargin: 12 }],
      valuation: { trailingPE: 18, priceToBook: 2.9, currency: "EUR" }
    } as never);

    const first = renderAssetPage("MC.PA", { search: "?tab=fundamentals" });
    expect(await screen.findByText("financial-chart")).toBeInTheDocument();
    expect(screen.getByText("Valorisation")).toBeInTheDocument();
    expect(screen.queryByText("calendar-events-MC.PA")).not.toBeInTheDocument();
    first.unmount();

    renderAssetPage("MC.PA", { search: "?tab=analysts" });
    expect(await screen.findByText("calendar-events-MC.PA")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Analystes" })).not.toBeInTheDocument();
  });
});
