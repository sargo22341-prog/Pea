import type { CashLedgerDto, DividendProposalsDto, OpeningDividendsEstimate } from "@pea/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyPeaPage } from "../../pages/pea/MyPeaPage";

const cashLedger = vi.fn<() => Promise<CashLedgerDto>>();
const openingDividendsEstimate = vi.fn<() => Promise<OpeningDividendsEstimate>>();
const confirmOpeningDividends = vi.fn<(amount: number | null) => Promise<CashLedgerDto>>();
const configureCashAccount = vi.fn<(input: unknown) => Promise<CashLedgerDto>>();

vi.mock("../../lib/api", () => ({
  api: {
    cashLedger: () => cashLedger(),
    portfolioFull: () => new Promise(() => undefined),
    dividendProposals: (): Promise<DividendProposalsDto> => Promise.resolve({ pending: [], ignored: [], recent: [], unreadAutoAccepted: 0, cash: 100 }),
    openingDividendsEstimate: () => openingDividendsEstimate(),
    confirmOpeningDividends: (amount: number | null) => confirmOpeningDividends(amount),
    configureCashAccount: (input: unknown) => configureCashAccount(input),
    cashMonthlyCheck: () => Promise.resolve({ months: [], counts: { ok: 0, mismatch: 0, opening: 0, quiet: 0, missing: 0 } })
  }
}));

function ledger(openingDividends: number | undefined, updatedAt: string): CashLedgerDto {
  return {
    summary: {
      status: "ready", referenceAt: "2026-03-01T00:00:00.000Z", cash: 100, deposits: 700, withdrawals: 0, netDeposits: 700, cashDividends: openingDividends ?? 0,
      otherCredits: 0,
      standaloneFees: 0, depositCeiling: 150_000, remainingCeiling: 149_300, realizedGain: 0, historyIncomplete: true
    },
    settings: { status: "ready", referenceAt: "2026-03-01T00:00:00.000Z", openingCash: 100, openingDeposits: 700, openingWithdrawals: 0, openingDividends, updatedAt },
    cashStatementsImported: false,
    entries: []
  };
}

const estimate: OpeningDividendsEstimate = {
  referenceAt: "2026-03-01T00:00:00.000Z", cash: 100, netDeposits: 700, buys: 610, sells: 0, otherCredits: 0, standaloneFees: 0, implied: 10, publishedGross: 10, publishedNet: 10, warnings: []
};

describe("Mon PEA : dividendes déjà perçus", () => {
  beforeEach(() => {
    cashLedger.mockResolvedValue(ledger(undefined, "2026-10-20 17:00:00"));
    openingDividendsEstimate.mockResolvedValue(estimate);
    confirmOpeningDividends.mockImplementation((amount) => {
      cashLedger.mockResolvedValue(ledger(amount ?? undefined, "2026-10-20 17:18:46"));
      openingDividendsEstimate.mockResolvedValue({ ...estimate, declared: amount ?? undefined });
      return Promise.resolve(ledger(amount ?? undefined, "2026-10-20 17:18:46"));
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("confirms, then shows the confirmed amount and lets the user change it again without error", async () => {
    render(<MemoryRouter><MyPeaPage /></MemoryRouter>);
    expect(await screen.findByText(/ne sont pas encore confirmés/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Calculer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmer" }));
    await waitFor(() => { expect(confirmOpeningDividends).toHaveBeenCalledWith(10); });

    expect(await screen.findByText(/Dividendes déjà perçus confirmés : 10,00\s€/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmer" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    fireEvent.change(await screen.findByLabelText("Dividendes perçus à enregistrer (€)"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    await waitFor(() => { expect(confirmOpeningDividends).toHaveBeenLastCalledWith(12); });
    expect(await screen.findByText(/Dividendes déjà perçus confirmés : 12,00\s€/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens the dividends step right after the initial state is configured from this page", async () => {
    const pendingLedger = ledger(undefined, "2026-10-20 16:00:00");
    cashLedger.mockResolvedValue({ ...pendingLedger, summary: { ...pendingLedger.summary, status: "pending", referenceAt: undefined }, settings: { ...pendingLedger.settings, status: "pending", referenceAt: undefined } });
    configureCashAccount.mockImplementation(() => {
      cashLedger.mockResolvedValue(ledger(undefined, "2026-10-20 17:00:00"));
      return Promise.resolve(ledger(undefined, "2026-10-20 17:00:00"));
    });
    render(<MemoryRouter><MyPeaPage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Solde espèces à cette date"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Versements cumulés depuis l'ouverture"), { target: { value: "700" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer l'état initial" }));

    expect(await screen.findByLabelText("Dividendes perçus à enregistrer (€)")).toHaveValue(10);
    expect(screen.getByRole("button", { name: "Confirmer" })).toBeInTheDocument();
  });
});
