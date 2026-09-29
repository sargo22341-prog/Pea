import type { ScreenerFilters, ScreenerPreset, ScreenerQuery, ScreenerResponse } from "@pea/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screenerSearchParams } from "../../lib/api-clients/screener-api";
import { fromCanonical, toCanonical } from "../../pages/screener/screener-config";
import { ScreenerPage } from "../../pages/screener/ScreenerPage";

const screener = vi.fn<(query: ScreenerQuery) => Promise<ScreenerResponse>>();
const saveScreenerPreset = vi.fn<(name: string, filters: ScreenerFilters) => Promise<ScreenerPreset>>();
let savedPresets: ScreenerPreset[] = [];

vi.mock("../../lib/api", () => ({
  api: {
    screener: (query: ScreenerQuery) => screener(query),
    screenerOptions: () => Promise.resolve({ sectors: ["Energy", "Utilities"], countries: ["France"] }),
    screenerPresets: () => Promise.resolve(savedPresets),
    saveScreenerPreset: (name: string, filters: ScreenerFilters) => saveScreenerPreset(name, filters),
    deleteScreenerPreset: vi.fn(() => Promise.resolve(undefined))
  }
}));
vi.mock("../../hooks/useAuthenticatedImageUrl", () => ({ useAuthenticatedImageUrl: () => null }));

const response: ScreenerResponse = {
  total: 2,
  truncated: false,
  rows: [
    { symbol: "TTE.PA", name: "TotalEnergies", isEtf: false, peaEligible: true, currency: "EUR", trailingPE: 8, dividendYield: 0.052, marketCap: 140e9 },
    { symbol: "ENGI.PA", name: "Engie", isEtf: false, peaEligible: true, currency: "EUR", dividendYield: 0.08, marketCap: 35e9 }
  ]
};

function renderPage() {
  render(<MemoryRouter><ScreenerPage /></MemoryRouter>);
}

describe("ScreenerPage", () => {
  beforeEach(() => {
    localStorage.clear();
    savedPresets = [];
    screener.mockResolvedValue(response);
    saveScreenerPreset.mockImplementation((name, filters) => {
      const preset = { id: 7, name, filters, createdAt: "2026-09-29T10:00:00.000Z" };
      savedPresets = [preset];
      return Promise.resolve(preset);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts with PEA-eligible assets sorted by market cap and shows the default columns", async () => {
    renderPage();
    const table = await screen.findByRole("table");
    expect(screener).toHaveBeenLastCalledWith({ filters: { peaOnly: true }, sort: "marketCap", direction: "desc" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Actif", "PER", "Rendement", "Capitalisation"]);
    expect(within(table).getByRole("row", { name: /Engie/ })).toHaveTextContent("n/a");
    expect(screen.getByText("resultats")).toBeInTheDocument();
    expect(screen.queryByText("Capitalisation minimum (Md)")).not.toBeInTheDocument();
  });

  it("applies a built-in preset, shows percentages in the inputs and sorts by a column", async () => {
    renderPage();
    await screen.findByRole("table");
    fireEvent.click(within(screen.getByRole("group", { name: "Filtres predefinis et enregistres" })).getByRole("button", { name: "Rendement" }));
    expect(screen.getByLabelText("Rendement minimum (%)")).toHaveValue(4);
    await waitFor(() => {
      expect(screener).toHaveBeenLastCalledWith({ filters: { peaOnly: true, assetType: "stock", minDividendYield: 0.04 }, sort: "marketCap", direction: "desc" });
    });

    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "PER" }));
    await waitFor(() => {
      expect(screener).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "trailingPE", direction: "asc" }));
    });
    expect(screen.getByRole("columnheader", { name: /PER/ })).toHaveAttribute("aria-sort", "ascending");
  });

  it("saves the current filters under a name and lists the saved preset", async () => {
    renderPage();
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("PER maximum"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Nom du filtre a enregistrer"), { target: { value: "Pas cher" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les filtres" }));

    expect(await screen.findByRole("button", { name: "Pas cher" })).toBeInTheDocument();
    expect(saveScreenerPreset).toHaveBeenCalledWith("Pas cher", { peaOnly: true, maxTrailingPE: 15 });
  });
});

describe("screener helpers", () => {
  it("converts displayed percentages and billions to API units", () => {
    expect(toCanonical("4,5", 100)).toBe(0.045);
    expect(toCanonical("10", 1e-9)).toBe(10e9);
    expect(toCanonical("", 100)).toBeUndefined();
    expect(fromCanonical(0.07, 100)).toBe("7");
    expect(fromCanonical(undefined, 100)).toBe("");
  });

  it("only sends the filters that are set", () => {
    const params = screenerSearchParams({ filters: { peaOnly: false, assetType: "all", sector: "Energy", minDividendYield: 0.03 }, sort: "name", direction: "asc" });
    expect(params.toString()).toBe("sort=name&direction=asc&sector=Energy&minDividendYield=0.03");
  });
});
