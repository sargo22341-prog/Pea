import type { PeaOverview, PortfolioSummary } from "@pea/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyContext } from "../../contexts/privacy-context";
import { PeaOverviewCards } from "../../pages/pea/components/PeaOverviewCards";

const pea: PeaOverview = {
  status: "ready",
  cash: 230,
  deposits: 1000,
  withdrawals: 100,
  netDeposits: 900,
  cashDividends: 30,
  otherCredits: 0,
  standaloneFees: 2,
  depositCeiling: 150_000,
  remainingCeiling: 149_000,
  realizedGain: 200,
  historyIncomplete: true,
  positionsValue: 900,
  totalValue: 1130,
  latentGain: 0,
  globalGain: 230,
  simpleReturnPercent: 25.56
};

const summary: PortfolioSummary = {
  totalValue: 900,
  totalCost: 900,
  totalDividendsReceived: 12,
  totalFees: 4,
  totalPerformance: 0,
  totalPerformancePercent: 0,
  positionsCount: 9,
  assetsCount: 1,
  currency: "EUR",
  positions: [],
  pea
};

function renderCards(value: PortfolioSummary, privacyEnabled = false) {
  return render(
    <PrivacyContext.Provider value={{ privacyEnabled }}>
      <PeaOverviewCards summary={value} />
    </PrivacyContext.Provider>
  );
}

function rowValue(label: string) {
  return (screen.getByText(label).closest("dt")?.nextElementSibling?.textContent ?? "").replace(/\s/g, "");
}

/** Zone de survol de l'icône ⓘ d'un indicateur. */
function hintTrigger(name: string) {
  const trigger = screen.getByRole("button", { name }).parentElement;
  if (!trigger) throw new Error(`Icône d'information introuvable : ${name}`);
  return trigger;
}

describe("PeaOverviewCards", () => {
  it("groups value, external flows and performance of the PEA", () => {
    renderCards(summary);

    expect(rowValue("Valeur totale du PEA")).toBe("1130,00€");
    expect(rowValue("Solde espèces")).toBe("230,00€");
    expect(rowValue("Versements cumulés")).toBe("1000,00€");
    expect(rowValue("Plafond de versements restant")).toBe("149000,00€");
    expect(rowValue("Plus-values réalisées")).toBe("200,00€");
    expect(rowValue("Dividendes encaissés")).toBe("30,00€");
    expect(rowValue("Dividendes estimés")).toBe("12,00€");
    expect(rowValue("Frais")).toBe("6,00€");
    expect(screen.getByText(/Historique résumé par l'état initial/)).toBeInTheDocument();
  });

  it("shows only position data while the initial state is not confirmed", () => {
    renderCards({ ...summary, pea: { ...pea, status: "pending" } });

    expect(rowValue("Valeur des positions")).toBe("900,00€");
    expect(screen.queryByText("Versements cumulés")).not.toBeInTheDocument();
    expect(screen.queryByText("Solde espèces")).not.toBeInTheDocument();
  });

  it("explains each indicator on hover of its info icon", () => {
    renderCards(summary);

    const dividendsHint = hintTrigger("Dividendes estimés");
    fireEvent.mouseEnter(dividendsHint);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/dividendes publiés par Yahoo Finance/);
    fireEvent.mouseLeave(dividendsHint);
    fireEvent.mouseEnter(hintTrigger("Plafond de versements restant"));
    expect(screen.getByRole("tooltip")).toHaveTextContent(/Seuls les versements comptent/);
  });

  it("masks amounts in private mode", () => {
    renderCards(summary, true);

    expect(rowValue("Valeur totale du PEA")).toBe("••••");
    expect(rowValue("Gain global")).toBe("••••");
  });
});
