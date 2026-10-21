import type { CashLedgerDto, FullHistoryPreview } from "@pea/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivacyContext } from "../../../contexts/privacy-context";
import { changeAppLanguage } from "../../../i18n";
import enCash from "../../../i18n/locales/en/cash.json";
import frCash from "../../../i18n/locales/fr/cash.json";
import { FullHistoryCard } from "../../../pages/pea/components/full-history/FullHistoryCard";

const fullHistoryPreview = vi.fn<() => Promise<FullHistoryPreview>>();
const completeFullHistory = vi.fn<() => Promise<CashLedgerDto>>();

vi.mock("../../../lib/api", () => ({
  api: { fullHistoryPreview: () => fullHistoryPreview(), completeFullHistory: () => completeFullHistory() }
}));

const totals = { cash: 1226.25, deposits: 1400, withdrawals: 0, cashDividends: 1.7, otherCredits: 0 };
const eligible: FullHistoryPreview = {
  eligible: true,
  blockers: [],
  referenceAt: "2021-08-31T20:00:00.000Z",
  firstPeriod: "2021-07",
  lastPeriod: "2021-08",
  statements: 2,
  creations: [{ kind: "deposit", count: 2, amount: 400 }],
  dividends: { count: 1, amount: 1.7 },
  before: totals,
  after: { ...totals, deposits: 1450 }
};
const blocked: FullHistoryPreview = {
  ...eligible,
  eligible: false,
  after: undefined,
  blockers: [
    { code: "missing_trade_notices", count: 12, references: ["2021-07#2", "2021-09#1"] },
    { code: "continuity_break", count: 1, references: ["2022-03"] }
  ]
};
const ledger = { summary: {}, settings: {}, entries: [] } as unknown as CashLedgerDto;

function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key));
}

describe("passage en historique complet", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("compares the indicators and switches only after explicit confirmation", async () => {
    const user = userEvent.setup();
    fullHistoryPreview.mockResolvedValue(eligible);
    completeFullHistory.mockResolvedValue(ledger);
    const onCompleted = vi.fn();
    render(<FullHistoryCard onCompleted={onCompleted} version="eligible" />);
    expect(await screen.findByText("2 relevés espèces importés, de 07/2021 à 08/2021.")).toBeInTheDocument();
    expect(screen.getByText(/2 × Versement créé\(s\) depuis les relevés : 400,00/)).toBeInTheDocument();
    expect(screen.getByText(/1 dividende\(s\) certifié\(s\)/)).toBeInTheDocument();
    expect(screen.getByText("Versements cumulés").closest("tr")).toHaveClass("text-amber");
    expect(screen.getByText(/l'état initial déclaré n'était pas exact/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Passer en historique complet" }));
    expect(completeFullHistory).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("L'état initial sera supprimé");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Passer en historique complet" }));
    expect(completeFullHistory).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledWith(ledger);
  });

  it("lists what is still missing instead of offering the switch", async () => {
    fullHistoryPreview.mockResolvedValue(blocked);
    render(<FullHistoryCard onCompleted={vi.fn()} version="blocked" />);
    expect(await screen.findByText(/12 achats ou ventes des relevés n'ont pas d'opération/)).toBeInTheDocument();
    expect(screen.getByText("07/2021 n° 2, 09/2021 n° 1…")).toBeInTheDocument();
    expect(screen.getByText(/Un relevé ne reprend pas le solde du précédent/)).toBeInTheDocument();
    expect(screen.getByText("03/2022")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Passer en historique complet" })).not.toBeInTheDocument();
  });

  it("masks amounts in privacy mode", async () => {
    fullHistoryPreview.mockResolvedValue(eligible);
    render(<PrivacyContext.Provider value={{ privacyEnabled: true }}><FullHistoryCard onCompleted={vi.fn()} version="private" /></PrivacyContext.Provider>);
    expect(await screen.findByText("Solde espèces")).toBeInTheDocument();
    expect(screen.queryByText(/1\s226,25/)).not.toBeInTheDocument();
    expect(screen.queryByText(/400,00/)).not.toBeInTheDocument();
  });

  it("is translated in French and English", async () => {
    expect(keysOf(enCash.fullHistory).sort()).toEqual(keysOf(frCash.fullHistory).sort());
    await changeAppLanguage("en");
    try {
      fullHistoryPreview.mockResolvedValue(eligible);
      render(<FullHistoryCard onCompleted={vi.fn()} version="english" />);
      expect(await screen.findByRole("button", { name: "Switch to full history" })).toBeInTheDocument();
    } finally {
      await changeAppLanguage("fr");
    }
  });
});
