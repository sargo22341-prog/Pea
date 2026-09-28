import type { PortfolioAnalysis } from "@pea/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisPage } from "../../pages/analysis/AnalysisPage";

const portfolioAnalysis = vi.fn<() => Promise<PortfolioAnalysis>>();

vi.mock("../../lib/api", () => ({
  api: {
    portfolioAnalysis: () => portfolioAnalysis()
  }
}));

function analysis(overrides: Partial<PortfolioAnalysis> = {}): PortfolioAnalysis {
  return {
    countryAllocation: [{ name: "France", value: 100, percentage: 100, symbols: [] }],
    sectorAllocation: [],
    treemap: [],
    netMargins: [],
    financials: [],
    financialsByAsset: [],
    capitalizationAllocation: [],
    currencyAllocation: [],
    valuation: {
      trailingPE: { value: 12.5, coverage: 80 },
      dividendYield: { value: 0.031, coverage: 100 },
      beta: { coverage: 0 },
      items: [
        { symbol: "AI.PA", name: "Air Liquide", weight: 80, trailingPE: 12.5, dividendYield: 0.02 },
        { symbol: "LOSS.PA", name: "Perte SA", weight: 20, trailingPE: -4, dividendYield: 0.075 }
      ]
    },
    lookThrough: { items: [], undisclosedEtfWeight: 0, etfCount: 0 },
    dividendSustainability: [],
    ...overrides
  };
}

async function renderPage() {
  render(
    <MemoryRouter>
      <AnalysisPage />
    </MemoryRouter>
  );
  return screen.findByRole("combobox");
}

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("AnalysisPage", () => {
  it("only offers the tabs that have data, grouped by family", async () => {
    portfolioAnalysis.mockResolvedValue(analysis());
    const select = await renderPage();

    const groups = within(select).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("label"))).toEqual(["Repartition", "Qualite"]);
    expect(groups.map((group) => within(group).getAllByRole("option").map((option) => option.textContent))).toEqual([["Repartition par pays"], ["Valorisation du portefeuille"]]);
    expect(within(select).queryByRole("option", { name: "Correlation entre les lignes" })).not.toBeInTheDocument();
  });

  it("shows the weighted valuation with its coverage and keeps the per-asset table folded", async () => {
    portfolioAnalysis.mockResolvedValue(analysis());
    const select = await renderPage();
    fireEvent.change(select, { target: { value: "valuation" } });

    expect(await screen.findByText("12,5")).toBeInTheDocument();
    expect(screen.getByText("3,10 %")).toBeInTheDocument();
    expect(screen.getByText("Calcule sur 80 % du portefeuille")).toBeInTheDocument();
    expect(screen.queryByText("Beta pondere")).not.toBeInTheDocument();
    expect(screen.queryByText("Perte SA")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Voir par actif/ }));
    expect(screen.getByText("Perte SA")).toBeInTheDocument();
    expect(screen.getByText("n.s.")).toBeInTheDocument();
  });

  it("shows the empty state when no tab has data", async () => {
    portfolioAnalysis.mockResolvedValue(analysis({ countryAllocation: [], valuation: { trailingPE: { coverage: 0 }, dividendYield: { coverage: 0 }, beta: { coverage: 0 }, items: [] } }));
    render(
      <MemoryRouter>
        <AnalysisPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("link", { name: /Ajouter/ })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
