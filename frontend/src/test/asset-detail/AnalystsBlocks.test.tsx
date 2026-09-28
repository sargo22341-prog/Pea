import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnalystTrendBlock } from "../../pages/asset-detail/components/analysts/AnalystTrendBlock";
import { EarningsBlock } from "../../pages/asset-detail/components/analysts/EarningsBlock";

afterEach(() => {
  window.localStorage.clear();
});

const month = (period: string, strongBuy: number, hold: number) => ({ period, strongBuy, buy: 0, hold, sell: 0, strongSell: 0 });

describe("AnalystTrendBlock", () => {
  it("summarizes the current month and keeps history collapsed", () => {
    render(
      <AnalystTrendBlock
        trend={{
          periods: [month("-3m", 1, 3), month("0m", 3, 1)],
          direction: "more-positive",
          history: [{ date: "2026-09-20T00:00:00.000Z", firm: "Broker A", action: "up", fromGrade: "Hold", toGrade: "Buy" }]
        }}
      />
    );

    expect(screen.getByText("Plus positif qu'il y a 3 mois")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Acheter fort 3/ })).toBeInTheDocument();
    expect(screen.queryByText("Broker A")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /historique/i }));
    expect(screen.getByText("Broker A")).toBeInTheDocument();
    expect(screen.getByText("Hold → Buy")).toBeInTheDocument();
    expect(screen.getByText("Il y a 3 mois")).toBeInTheDocument();
    expect(screen.getByText("Ce mois")).toBeInTheDocument();
  });
});

describe("EarningsBlock", () => {
  it("shows the next publication first and colors reported quarters by surprise", () => {
    render(
      <EarningsBlock
        earnings={{
          currency: "EUR",
          next: { date: "2026-10-14T15:30:00.000Z", isEstimate: true, epsAverage: 10.58, revenueAverage: 9_000_000_000 },
          quarters: [
            { period: "-2q", endDate: "2026-03-31T00:00:00.000Z", epsEstimate: 6.6, epsActual: 7.15, surprisePercent: 0.08 },
            { period: "-1q", endDate: "2026-06-30T00:00:00.000Z", epsEstimate: 7.5, epsActual: 7.3, surprisePercent: -0.027 }
          ]
        }}
        fallbackCurrency="EUR"
      />
    );

    expect(screen.getByText("14/10/2026")).toBeInTheDocument();
    expect(screen.getByText("Date estimee")).toBeInTheDocument();
    expect(screen.getByText((content) => content.replace(/\s/g, "") === "10,58€")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /4 derniers trimestres/i }));
    expect(screen.getByTitle(/Publie : 7,15/)).toHaveClass("bg-mint");
    expect(screen.getByTitle(/Publie : 7,30/)).toHaveClass("bg-coral");
    expect(screen.getByText("T1 2026")).toBeInTheDocument();
    expect(screen.getByText("+8,0 %")).toHaveClass("text-mint");
  });
});
