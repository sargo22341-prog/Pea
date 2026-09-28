import type { PortfolioCorrelation, PortfolioLookThrough } from "@pea/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CorrelationPanel } from "../../pages/analysis/components/correlation/CorrelationPanel";
import { DividendSustainabilityPanel } from "../../pages/analysis/components/dividends/DividendSustainabilityPanel";
import { sustainabilityRating } from "../../pages/analysis/components/dividends/sustainability-rating";
import { LookThroughPanel } from "../../pages/analysis/components/look-through/LookThroughPanel";

afterEach(() => {
  window.localStorage.clear();
});

const correlation: PortfolioCorrelation = {
  assets: [{ symbol: "BNP.PA", name: "BNP Paribas" }, { symbol: "GLE.PA", name: "Societe Generale" }, { symbol: "AI.PA", name: "Air Liquide" }],
  matrix: [[1, 0.91, 0.2], [0.91, 1, null], [0.2, null, 1]],
  observations: 251,
  highPairs: [{ a: "BNP.PA", b: "GLE.PA", value: 0.91 }]
};

describe("CorrelationPanel", () => {
  it("names the highly correlated pairs first and keeps the matrix folded", () => {
    render(<CorrelationPanel correlation={correlation} />);

    expect(screen.getByText(/1 paire tres correlee \(au-dela de 0,8\)/)).toBeInTheDocument();
    expect(screen.getByText("BNP Paribas et Societe Generale")).toBeInTheDocument();
    expect(screen.getByText("Calculee sur 251 seances communes.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Voir la matrice/ }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByTitle("Societe Generale / Air Liquide : n/a")).toBeInTheDocument();
  });

  it("says so when no pair is highly correlated", () => {
    render(<CorrelationPanel correlation={{ ...correlation, highPairs: [] }} />);

    expect(screen.getByText(/Aucune paire tres correlee/)).toBeInTheDocument();
    expect(screen.queryByText("BNP Paribas et Societe Generale")).not.toBeInTheDocument();
  });
});

describe("DividendSustainabilityPanel", () => {
  it("rates each line with the shared thresholds and counts the verdicts", () => {
    render(
      <DividendSustainabilityPanel
        items={[
          { symbol: "AI.PA", name: "Air Liquide", weight: 40, payoutRatio: 0.5, fcfCoverage: 1.5 },
          { symbol: "TTE.PA", name: "TotalEnergies", weight: 30, payoutRatio: 0.7 },
          { symbol: "LOSS.PA", name: "Perte SA", weight: 30, payoutRatio: 0.4, fcfCoverage: 0.6 }
        ]}
      />
    );

    expect(screen.getByText("1 dividende confortable")).toBeInTheDocument();
    expect(screen.getByText("1 a surveiller")).toBeInTheDocument();
    expect(screen.getByText("1 fragile")).toBeInTheDocument();
    expect(screen.getByText("x1,5")).toBeInTheDocument();
    expect(screen.getByText("x0,6")).toBeInTheDocument();
  });

  it("uses the least favourable of the payout ratio and the FCF coverage", () => {
    const line = { symbol: "A", name: "A", weight: 1 };
    expect(sustainabilityRating({ ...line, payoutRatio: 0.4, fcfCoverage: 0.6 })).toBe("weak");
    expect(sustainabilityRating({ ...line, payoutRatio: 0.7, fcfCoverage: 2 })).toBe("fair");
    expect(sustainabilityRating({ ...line, fcfCoverage: 2 })).toBe("good");
    expect(sustainabilityRating(line)).toBeUndefined();
  });
});

describe("LookThroughPanel", () => {
  const lookThrough: PortfolioLookThrough = {
    items: [
      { key: "ASML.AS", symbol: "ASML.AS", name: "ASML Holding", directWeight: 20, viaEtfWeight: 3.1, totalWeight: 23.1, viaEtf: [{ symbol: "CW8.PA", name: "Amundi MSCI World", weight: 3.1 }] },
      { key: "AAPL", symbol: "AAPL", name: "Apple", directWeight: 0, viaEtfWeight: 1.2, totalWeight: 1.2, viaEtf: [{ symbol: "CW8.PA", name: "Amundi MSCI World", weight: 1.2 }] }
    ],
    undisclosedEtfWeight: 35.7,
    etfCount: 1
  };

  it("highlights the largest indirect exposure and the undisclosed share, hidden in the direct view", () => {
    render(<LookThroughPanel direct={[]} lookThrough={lookThrough} />);

    expect(screen.getByText("Via vos ETF, vous detenez 3,1 % de plus en ASML Holding, soit 23,1 % au total.")).toBeInTheDocument();
    expect(screen.getByText(/35,7 % du portefeuille n'est pas detaille/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Direct" }));
    expect(screen.queryByText(/n'est pas detaille/)).not.toBeInTheDocument();
  });
});
