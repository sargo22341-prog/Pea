import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOTION } from "../../components/common/motion";
import { AssetDetailPage } from "../../pages/asset-detail/AssetDetailPage";
import { api } from "../../lib/api";

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

vi.mock("../../components/common/AssetCalendarEvents", () => ({
  AssetCalendarEvents: () => <div>calendar-events</div>
}));

vi.mock("../../components/common/CompareModal", () => ({
  CompareModal: () => <div data-testid="compare-modal">compare-modal</div>
}));

vi.mock("../../lib/api", () => ({
  api: {
    addWatchlist: vi.fn(),
    asset: vi.fn(),
    removeWatchlist: vi.fn(),
    requestChartRefresh: vi.fn()
  }
}));

vi.mock("../../hooks/useAssetComparisonSeries", () => ({
  useAssetComparisonSeries: () => ({ series: [], loading: false, preparingSymbols: [] })
}));

const user = {
  id: 1,
  username: "alice",
  role: "user",
  defaultChartRange: "1d",
  assetNewsEnabled: false,
  localPeaSearchEnabled: true
} as const;

function assetDto(price: number) {
  return {
    appTimezone: "Europe/Paris",
    quote: { symbol: "ASML.AS", name: "ASML", price, currency: "EUR", exchange: "Amsterdam", marketState: "REGULAR" },
    marketInfo: { regularMarketPrice: price, marketState: "REGULAR" },
    chart: { symbol: "ASML.AS", range: "1d", interval: "5m", timestamps: [1_000, 2_000], prices: [99, price] },
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

function priceElement(amount: string) {
  const header = screen.getByRole("heading", { level: 1 }).closest("section") as HTMLElement;
  return within(header).getByText((content) => content.replace(/\s/g, "") === amount);
}

async function emitSnapshotUpdate() {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("pea:market-event", {
      detail: { type: "market-snapshot-updated", symbol: "ASML.AS", updatedAt: new Date().toISOString() }
    }));
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  });
}

describe("animations de la fiche actif", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fait entrer les sections de la page en cascade", async () => {
    vi.mocked(api.asset).mockResolvedValue(assetDto(100) as never);
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "skipped-fresh" });

    const { container } = renderPage();
    await screen.findByText("ASML");

    const stack = container.querySelector(`.${MOTION.stagger}`);
    expect(stack).not.toBeNull();
    expect(stack?.children.length).toBeGreaterThan(2);
    expect(screen.getByText("ASML").closest(`.${MOTION.stagger}`)).toBe(stack);
  });

  it("laisse les fenetres modales hors du conteneur anime", async () => {
    vi.mocked(api.asset).mockResolvedValue(assetDto(100) as never);
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "skipped-fresh" });

    renderPage();
    await screen.findByText("ASML");

    fireEvent.click(screen.getByRole("button", { name: /comparer/i }));

    const modal = await screen.findByTestId("compare-modal");
    expect(modal.closest(`.${MOTION.stagger}`)).toBeNull();
  });

  it("n'anime pas le prix au premier affichage", async () => {
    vi.mocked(api.asset).mockResolvedValue(assetDto(100) as never);
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "skipped-fresh" });

    renderPage();
    await screen.findByText("ASML");

    expect(priceElement("100,00€").className).not.toMatch(/motion-flash/);
  });

  it("met le prix en surbrillance quand une cotation plus haute arrive", async () => {
    vi.mocked(api.asset)
      .mockResolvedValueOnce(assetDto(100) as never)
      .mockResolvedValue(assetDto(120) as never);
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "skipped-fresh" });

    renderPage();
    await screen.findByText("ASML");

    await emitSnapshotUpdate();

    await waitFor(() => expect(priceElement("120,00€")).toHaveClass(MOTION.flashUp));
  });

  it("anime l'etoile de la liste de suivi a chaque bascule", async () => {
    vi.mocked(api.asset).mockResolvedValue(assetDto(100) as never);
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "skipped-fresh" });
    vi.mocked(api.addWatchlist).mockResolvedValue(undefined as never);

    const { container } = renderPage();
    await screen.findByText("ASML");

    const watchlistButton = screen.getByRole("button", { pressed: false });
    expect(container.querySelector(`.${MOTION.pop}`)).toBeNull();

    fireEvent.click(watchlistButton);

    await waitFor(() => expect(container.querySelector(`.${MOTION.pop}`)).not.toBeNull());
    expect(screen.getByRole("button", { pressed: true })).toBe(watchlistButton);
  });
});
