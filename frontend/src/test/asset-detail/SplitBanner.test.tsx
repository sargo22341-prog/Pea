import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { baseAssetDto, renderAssetPage } from "./assetPageFixture";

vi.mock("../../components/charts/PriceHistoryChart", () => ({
  PriceHistoryChart: () => <div>price-chart</div>,
  ComparisonChart: () => <div>comparison-chart</div>
}));

vi.mock("../../components/common/AssetCalendarEvents", () => ({
  AssetCalendarEvents: () => <div>calendar-events</div>
}));

vi.mock("../../lib/api", () => ({
  api: {
    asset: vi.fn(),
    requestChartRefresh: vi.fn(),
    splits: vi.fn(),
    decideSplit: vi.fn()
  }
}));

vi.mock("../../hooks/useAssetComparisonSeries", () => ({
  useAssetComparisonSeries: () => ({ series: [], loading: false, preparingSymbols: [] })
}));

const pendingSplit = { id: 7, symbol: "NVDA", assetName: "NVIDIA", positionId: 3, date: "2024-06-10", numerator: 10, denominator: 1, status: "pending" as const };

function assetDto() {
  return baseAssetDto("NVDA", "NVIDIA");
}

function renderPage() {
  return renderAssetPage("NVDA");
}

describe("split banner on the asset page", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("applies a pending split only after the user's decision and reloads the asset", async () => {
    vi.mocked(api.asset).mockResolvedValue(assetDto() as never);
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "skipped-fresh" });
    vi.mocked(api.splits).mockResolvedValueOnce([pendingSplit]).mockResolvedValue([{ ...pendingSplit, status: "applied" }]);
    vi.mocked(api.decideSplit).mockResolvedValue({ ...pendingSplit, status: "applied" });

    renderPage();

    expect(await screen.findByText(/Division d'action 1 -> 10 le 10\/06\/2024 detectee/)).toBeInTheDocument();
    expect(api.splits).toHaveBeenCalledWith("NVDA", expect.anything());
    expect(api.decideSplit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));

    await waitFor(() => { expect(api.decideSplit).toHaveBeenCalledWith(7, "apply"); });
    await waitFor(() => { expect(api.asset).toHaveBeenCalledTimes(2); });
    await waitFor(() => { expect(screen.queryByText(/detectee/)).not.toBeInTheDocument(); });
  });

  it("shows nothing without pending split", async () => {
    vi.mocked(api.asset).mockResolvedValue(assetDto() as never);
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "skipped-fresh" });
    vi.mocked(api.splits).mockResolvedValue([{ ...pendingSplit, status: "ignored" }]);

    renderPage();

    await screen.findByText("NVIDIA");
    await waitFor(() => { expect(api.splits).toHaveBeenCalled(); });
    expect(screen.queryByRole("button", { name: "Appliquer" })).not.toBeInTheDocument();
  });
});
