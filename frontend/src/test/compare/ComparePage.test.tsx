import type { CompareAssetDto } from "@pea/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComparePage } from "../../pages/compare/ComparePage";
import { LocationProbe } from "../asset-detail/LocationProbe";
import { closestElement } from "../utils/dom";

const compareAssets = vi.fn<(symbols: readonly string[]) => Promise<CompareAssetDto[]>>();
const history = vi.fn<(symbol: string) => Promise<unknown>>();

vi.mock("../../lib/api", () => ({
  api: {
    compareAssets: (symbols: readonly string[]) => compareAssets(symbols),
    history: (symbol: string) => history(symbol)
  }
}));
vi.mock("../../hooks/useAuthenticatedImageUrl", () => ({ useAuthenticatedImageUrl: () => null }));

const stock: CompareAssetDto = {
  symbol: "MC.PA", name: "LVMH", isEtf: false, currency: "EUR",
  valuation: { trailingPE: 18, marketCap: 300_000_000_000 },
  financialHealth: { isFinancialSector: false, metrics: { profitMargin: 0.18 } },
  dividend: { yield: 0.02 }
};
const etf: CompareAssetDto = {
  symbol: "CW8.PA", name: "Amundi MSCI World", isEtf: true, currency: "EUR",
  valuation: { trailingPE: 23 },
  dividend: {},
  fundDetails: { annualReportExpenseRatio: 0.0038 }
};

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/compare" element={<><ComparePage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ComparePage", () => {
  beforeEach(() => {
    compareAssets.mockResolvedValue([stock, etf]);
    history.mockRejectedValue(new Error("offline"));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads the symbols of the URL and shows families with the best value highlighted", async () => {
    renderAt("/compare?symbols=mc.pa,CW8.PA,MC.PA");
    const valuation = await screen.findByRole("table");
    expect(compareAssets).toHaveBeenCalledWith(["MC.PA", "CW8.PA"]);
    const perRow = within(valuation).getByRole("row", { name: /PER/ });
    expect(within(perRow).getByText("18")).toHaveClass("text-mint");
    expect(within(perRow).getByText("23")).not.toHaveClass("text-mint");

    fireEvent.click(screen.getByRole("button", { name: "Sante financiere" }));
    const healthRow = screen.getByRole("row", { name: /Marge nette/ });
    expect(within(healthRow).getByText("n/a")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Frais et performance ETF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Analystes" })).not.toBeInTheDocument();
  });

  it("shows each compared symbol once in the chart legend", async () => {
    history.mockImplementation((symbol) => Promise.resolve({ symbol, timestamps: [Date.UTC(2026, 0, 2), Date.UTC(2026, 0, 3)], prices: symbol === "MC.PA" ? [100, 110] : [50, 49] }));
    renderAt("/compare?symbols=MC.PA,CW8.PA");
    await screen.findByRole("table");
    const chart = closestElement(screen.getByRole("heading", { name: "Performance" }), "section");
    await waitFor(() => { expect(within(chart).getAllByText("CW8.PA")).toHaveLength(1); });
    expect(within(chart).getAllByText("MC.PA")).toHaveLength(1);
  });

  it("asks for a second asset after a removal and does not call the API with one symbol", async () => {
    renderAt("/compare?symbols=MC.PA,CW8.PA");
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Retirer CW8.PA" }));
    expect(await screen.findByText("Ajoutez au moins 2 actifs pour lancer la comparaison.")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("?symbols=MC.PA");
    expect(compareAssets).toHaveBeenCalledTimes(1);
  });

  it("keeps the first four assets of a longer link and says so", async () => {
    renderAt("/compare?symbols=A,B,C,D,E");
    expect(await screen.findByText(/4 actifs au maximum/)).toBeInTheDocument();
    expect(compareAssets).toHaveBeenCalledWith(["A", "B", "C", "D"]);
  });
});
