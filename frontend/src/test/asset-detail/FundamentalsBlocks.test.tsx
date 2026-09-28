import type { AssetFinancialHealth } from "@pea/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdvancedModeContext } from "../../components/common/disclosure/advanced-mode";
import { FinancialHealthBlock } from "../../pages/asset-detail/components/fundamentals/FinancialHealthBlock";
import { ValuationBlock } from "../../pages/asset-detail/components/fundamentals/ValuationBlock";

afterEach(() => {
  window.localStorage.clear();
});

describe("ValuationBlock", () => {
  it("shows a negative P/E as not meaningful and keeps secondary ratios collapsed", () => {
    render(<ValuationBlock valuation={{ trailingPE: -3.2, priceToBook: 1.4, priceToSales: 0.8, currency: "EUR" }} />);

    expect(screen.getByText("n.s.")).toBeInTheDocument();
    expect(screen.getByText("1,4")).toBeInTheDocument();
    expect(screen.queryByText("P/S")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /plus de ratios/i }));
    expect(screen.getByText("P/S")).toBeInTheDocument();
  });

  it("opens secondary ratios by default in advanced mode", () => {
    render(
      <AdvancedModeContext value>
        <ValuationBlock valuation={{ trailingPE: 15, priceToBook: 2, priceToSales: 0.8 }} />
      </AdvancedModeContext>
    );
    expect(screen.getByText("P/S")).toBeInTheDocument();
  });

  it("is hidden with fewer than two indicators", () => {
    const { container } = render(<ValuationBlock valuation={{ trailingPE: 15 }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

const health: AssetFinancialHealth = {
  isFinancialSector: false,
  currency: "EUR",
  metrics: { returnOnEquity: 0.2, debtToEquity: 250, revenueGrowth: 0.02, totalCash: 1_000_000 },
  verdict: { overall: "fair", categories: { profitability: "good", debt: "weak", growth: "fair" } }
};

describe("FinancialHealthBlock", () => {
  it("gives the verdict before the numbers and colors each ratio with the shared thresholds", () => {
    render(<FinancialHealthBlock health={health} />);

    expect(screen.getByText("Correcte")).toBeInTheDocument();
    expect(screen.getByText(/Endettement · faible/)).toBeInTheDocument();
    expect(screen.queryByText("ROE")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /voir les ratios/i }));
    const debt = screen.getByText("Dette / fonds propres").closest("div");
    expect(debt).not.toBeNull();
    expect(within(debt?.parentElement ?? document.body).getByText("250 %")).toHaveClass("text-coral");
    fireEvent.focus(screen.getByRole("button", { name: "Dette / fonds propres" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Vert si inferieur ou egal a 100 %, rouge au-dessus de 200 %.");
  });

  it("does not show debt ratios for banks and is hidden without verdict", () => {
    const { rerender, container } = render(
      <AdvancedModeContext value>
        <FinancialHealthBlock health={{ ...health, isFinancialSector: true, metrics: { returnOnEquity: 0.2, revenueGrowth: 0.1 } }} />
      </AdvancedModeContext>
    );
    expect(screen.queryByText("Dette / fonds propres")).not.toBeInTheDocument();

    rerender(<FinancialHealthBlock health={{ ...health, verdict: undefined }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
