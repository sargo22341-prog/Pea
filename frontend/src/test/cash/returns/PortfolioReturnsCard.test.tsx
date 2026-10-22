import type { PortfolioReturnsDto } from "@pea/shared";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivacyContext } from "../../../contexts/privacy-context";
import { clearAsyncDataCache } from "../../../lib/cache/async-data-cache";
import { PortfolioReturnsCard } from "../../../pages/pea/components/returns/PortfolioReturnsCard";

const portfolioReturns = vi.fn<() => Promise<PortfolioReturnsDto>>();

vi.mock("../../../lib/api", () => ({ api: { portfolioReturns: () => portfolioReturns() } }));

// Recharts ne mesure rien dans jsdom : le graphe est remplacé par la liste des barres reçues.
vi.mock("../../../components/charts/returns/AnnualReturnsChart", () => ({
  AnnualReturnsChart: ({ data }: { data: { year: number; value: number }[] }) => <div>bars:{data.map((row) => `${String(row.year)}=${row.value.toFixed(2)}`).join(",")}</div>
}));

const returns: PortfolioReturnsDto = {
  annualizedReturnPercent: 12.5,
  firstInvestmentAt: "2024-01-02T10:00:00.000Z",
  totalInvested: 2200,
  totalSold: 750,
  totalDividends: 20,
  currentValue: 2250,
  totalGain: 820,
  years: [
    { year: 2024, startValue: 0, endValue: 1100, invested: 1000, sold: 0, dividends: 0, capitalGain: 100, gain: 100, returnPercent: 10, partial: true },
    { year: 2025, startValue: 1100, endValue: 900, invested: 0, sold: 0, dividends: 0, capitalGain: -200, gain: -200, returnPercent: -18.18, partial: false },
    { year: 2026, startValue: 900, endValue: 2250, invested: 1200, sold: 0, dividends: 20, capitalGain: 150, gain: 170, partial: true }
  ],
  isPreparing: false,
  missingPriceSymbols: ["OLD.PA"],
  undatedSymbols: []
};

function renderCard(privacyEnabled = false) {
  return render(
    <PrivacyContext.Provider value={{ privacyEnabled }}>
      <PortfolioReturnsCard />
    </PrivacyContext.Provider>
  );
}

function row(year: string) {
  const cell = screen.getByText(year);
  const tableRow = cell.closest("tr");
  if (!tableRow) throw new Error(`Ligne introuvable : ${year}`);
  return within(tableRow);
}

describe("PortfolioReturnsCard", () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearAsyncDataCache();
  });

  it("shows the annualized return, one bar per measurable year and the yearly detail", async () => {
    portfolioReturns.mockResolvedValue(returns);
    renderCard();

    expect(await screen.findByText("+12,5 % par an")).toBeInTheDocument();
    expect(screen.getByText("depuis le 02/01/2024")).toBeInTheDocument();
    // L'année sans rendement mesurable (capital engagé nul) n'a pas de barre.
    expect(screen.getByText("bars:2024=0.10,2025=-0.18")).toBeInTheDocument();
    expect(row("2024*").getByText("+10 %")).toBeInTheDocument();
    expect(row("2025").getByText("-18,18 %")).toHaveClass("text-coral");
    expect(row("2026*").getByText("n/a")).toBeInTheDocument();
    expect(screen.getByText(/OLD\.PA/)).toBeInTheDocument();
  });

  it("explains a missing annualized return and masks amounts in private mode", async () => {
    portfolioReturns.mockResolvedValue({ ...returns, annualizedReturnPercent: undefined });
    renderCard(true);

    expect(await screen.findByText("Moins de 90 jours d'historique")).toBeInTheDocument();
    expect(screen.queryByText(/820/)).not.toBeInTheDocument();
    expect(screen.queryByText(/100,00/)).not.toBeInTheDocument();
    expect(row("2024*").getByText("+10 %")).toBeInTheDocument();
  });

  it("invites to record a dated purchase when there is none", async () => {
    portfolioReturns.mockResolvedValue({ ...returns, annualizedReturnPercent: undefined, firstInvestmentAt: undefined, years: [] });
    renderCard();

    expect(await screen.findByText(/Aucun achat daté/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
