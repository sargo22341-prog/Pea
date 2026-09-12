import type { PortfolioDividendEvent, PortfolioDividends } from "@pea/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DividendsPage } from "../../pages/dividends/DividendsPage";
import { money } from "../../lib/format";

const portfolioDividends = vi.fn<() => Promise<PortfolioDividends>>();

vi.mock("../../lib/api", () => ({
  api: {
    portfolioDividends: () => portfolioDividends()
  }
}));

// L'annee courante est lue au chargement du module : les donnees de test sont derivees de la
// meme horloge pour rester valides quelle que soit l'annee d'execution.
const currentYear = new Date().getUTCFullYear();
const referenceYear = currentYear - 1;
const projectedYear = currentYear + 1;

/** Testing Library normalise les espaces insecables des montants formates : on fait de meme. */
function normalizedMoney(value: number) {
  return money(value, "EUR").replace(/\s/g, " ");
}

function event(overrides: Partial<PortfolioDividendEvent> & { date: string; year: number }): PortfolioDividendEvent {
  return {
    symbol: "AIR.PA",
    name: "Airbus",
    amountPerShare: 1,
    quantity: 10,
    totalAmount: 10,
    currency: "EUR",
    status: "real",
    ...overrides
  };
}

function dividendsPayload(): PortfolioDividends {
  return {
    annualEstimatedTotal: 12,
    currency: "EUR",
    months: [],
    past: [event({ date: `${referenceYear}-05-20T00:00:00.000Z`, year: referenceYear, amountPerShare: 1, quantity: 10, totalAmount: 10 })],
    upcoming: [
      event({
        date: `${currentYear}-05-20T00:00:00.000Z`,
        year: currentYear,
        amountPerShare: 1.2,
        quantity: 10,
        status: "estimated",
        totalAmount: 12
      })
    ]
  };
}

async function renderPage() {
  render(
    <MemoryRouter>
      <DividendsPage />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByText(`Revenus ${currentYear}`)).toBeInTheDocument());
  return screen.getByRole("combobox");
}

describe("DividendsPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("propose l'annee suivante en projection et la calcule a partir des deux annees precedentes", async () => {
    portfolioDividends.mockResolvedValue(dividendsPayload());
    const yearSelect = await renderPage();

    expect(within(yearSelect).getByRole("option", { name: `${projectedYear} (projection)` })).toBeInTheDocument();

    fireEvent.change(yearSelect, { target: { value: String(projectedYear) } });

    expect(screen.getByText(`Projection ${projectedYear}`)).toBeInTheDocument();
    expect(screen.getByText(`Projection estimee a partir de ${currentYear} et ${referenceYear}`)).toBeInTheDocument();
    expect(screen.getByText("Annee projetee")).toBeInTheDocument();
    // 1,20 EUR par titre en N, soit +20 % face a N-1, projete a 1,44 EUR sur 10 titres.
    expect(screen.getAllByText(normalizedMoney(14.4)).length).toBeGreaterThan(0);
  });

  it("anime l'entree des lignes en cascade", async () => {
    portfolioDividends.mockResolvedValue({
      ...dividendsPayload(),
      past: [
        event({ date: `${currentYear}-05-20T00:00:00.000Z`, year: currentYear }),
        event({ date: `${currentYear}-06-20T00:00:00.000Z`, year: currentYear, symbol: "BNP.PA", name: "BNP Paribas", totalAmount: 5 })
      ],
      upcoming: []
    });
    await renderPage();

    const rows = screen.getAllByRole("link");
    expect(rows[0]).toHaveClass("motion-rise");
    expect(rows[0].getAttribute("style")).toBeNull();
    expect(rows[1]).toHaveStyle({ animationDelay: "35ms" });
  });

  it("n'affiche pas d'annee projetee sans dividende exploitable", async () => {
    portfolioDividends.mockResolvedValue({ ...dividendsPayload(), past: [], upcoming: [] });
    const yearSelect = await renderPage();

    expect(within(yearSelect).queryByRole("option", { name: `${projectedYear} (projection)` })).not.toBeInTheDocument();
    expect(screen.getByText("Total annuel estime")).toBeInTheDocument();
  });
});
