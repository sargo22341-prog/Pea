import type { PortfolioDividendEvent, PortfolioDividends } from "@pea/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivacyContext } from "../../contexts/privacy-context";
import { DividendsPage } from "../../pages/dividends/DividendsPage";

const portfolioDividends = vi.fn<() => Promise<PortfolioDividends>>();

vi.mock("../../lib/api", () => ({
  api: {
    portfolioDividends: () => portfolioDividends()
  }
}));

// Dates dérivées de l'horloge, comme la page : le test reste valide quelle que soit l'année.
const currentYear = new Date().getUTCFullYear();

function event(overrides: Partial<PortfolioDividendEvent> & { date: string; year: number }): PortfolioDividendEvent {
  return { symbol: "AI.PA", name: "Air Liquide", amountPerShare: 1, quantity: 10, totalAmount: 10, currency: "EUR", status: "real", payoutRatio: 0.55, ...overrides };
}

function payload(): PortfolioDividends {
  const past = Array.from({ length: 6 }, (_, index) => {
    const year = currentYear - 6 + index;
    return event({ date: `${year}-05-15T00:00:00.000Z`, year, amountPerShare: 2 + index * 0.1, totalAmount: (2 + index * 0.1) * 10 });
  });
  return {
    annualEstimatedTotal: 34,
    currency: "EUR",
    months: [],
    past: past.reverse(),
    upcoming: [
      event({ date: `${currentYear}-06-02T00:00:00.000Z`, year: currentYear, amountPerShare: 2.4, totalAmount: 24, status: "announced" }),
      event({ date: `${currentYear}-12-05T00:00:00.000Z`, year: currentYear, amountPerShare: 1, totalAmount: 10, status: "estimated" })
    ],
    expectedAnnualIncome: 34,
    marketValue: 1700
  };
}

async function renderPage(privacyEnabled = false) {
  portfolioDividends.mockResolvedValue(payload());
  render(
    <PrivacyContext.Provider value={{ privacyEnabled }}>
      <MemoryRouter>
        <DividendsPage />
      </MemoryRouter>
    </PrivacyContext.Provider>
  );
  await screen.findByText(`Revenus ${currentYear}`);
}

describe("DividendsPage growth, sustainability and simulation", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("shows growth, aristocrat badge, payout gauge and annual history of each asset", async () => {
    await renderPage();

    expect(screen.getByText("Croissance 5 ans")).toBeInTheDocument();
    expect(screen.getByText(`${(((2.5 / 2) ** (1 / 5) - 1) * 100).toFixed(1).replace(".", ",")} %/an`, { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Aristocrate")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Taux de distribution 55 % : confortable" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Historique annuel" }));
    expect(screen.getByRole("list", { name: "Dividende annuel par action" }).children).toHaveLength(6);
  });

  it("tells announced payments apart from estimates", async () => {
    await renderPage();

    expect(screen.getByText("Inclut annonce et estime")).toBeInTheDocument();
    expect(screen.getByText(/Annonces 24,00/)).toBeInTheDocument();
    expect(screen.getByText(/Estimes 10,00/)).toBeInTheDocument();
  });

  it("keeps the reinvestment simulation folded until asked", async () => {
    await renderPage();

    expect(screen.queryByText(/Dans 10 ans/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simuler le reinvestissement" }));
    expect(screen.getByText(/Dans 10 ans : .* de dividendes par an en reinvestissant/)).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /Horizon/ })).toHaveValue("10");
  });

  it("masks personal amounts in private mode", async () => {
    await renderPage(true);

    expect(screen.getByText("Annonces ••••")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simuler le reinvestissement" }));
    expect(screen.getByText("Dans 10 ans : •••• de dividendes par an en reinvestissant, contre •••• sans reinvestir.")).toBeInTheDocument();
  });
});
