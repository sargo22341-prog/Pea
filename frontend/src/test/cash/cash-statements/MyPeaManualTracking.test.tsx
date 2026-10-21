import type { CashAccountCheckDto, CashLedgerDto, DividendProposalsDto } from "@pea/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyPeaPage } from "../../../pages/pea/MyPeaPage";

const cashLedger = vi.fn<() => Promise<CashLedgerDto>>();
const cashMonthlyCheck = vi.fn<() => Promise<CashAccountCheckDto>>();
const fullHistoryPreview = vi.fn<() => Promise<never>>(() => new Promise(() => undefined));

vi.mock("../../../lib/api", () => ({
  api: {
    cashLedger: () => cashLedger(),
    portfolioFull: () => new Promise(() => undefined),
    dividendProposals: (): Promise<DividendProposalsDto> => Promise.resolve({ pending: [], ignored: [], recent: [], unreadAutoAccepted: 0, cash: 100 }),
    cashMonthlyCheck: () => cashMonthlyCheck(),
    fullHistoryPreview: () => fullHistoryPreview()
  }
}));

/** Compte avec état initial et un achat saisi à la main. */
function ledger(cashStatementsImported: boolean): CashLedgerDto {
  return {
    summary: {
      status: "ready", referenceAt: "2026-03-01T00:00:00.000Z", cash: 90, deposits: 700, withdrawals: 0, netDeposits: 700, cashDividends: 0, otherCredits: 0,
      standaloneFees: 0, depositCeiling: 150_000, remainingCeiling: 149_300, realizedGain: 0, historyIncomplete: true
    },
    settings: { status: "ready", referenceAt: "2026-03-01T00:00:00.000Z", openingCash: 100, openingDeposits: 700, openingWithdrawals: 0, openingDividends: 0 },
    cashStatementsImported,
    entries: [{ id: "transaction:1", kind: "buy", effectiveAt: "2026-04-02T09:00:00.000Z", amount: -10, balanceAfter: 90, absorbed: false, source: "manual", symbol: "AI.PA", quantity: 1, price: 10, fees: 0 }]
  };
}

describe("Mon PEA : suivi manuel sans relevé espèces", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("shows neither the monthly check nor the full history card, and does not query them", async () => {
    cashLedger.mockResolvedValue(ledger(false));
    render(<MemoryRouter><MyPeaPage /></MemoryRouter>);
    expect(await screen.findByText(/AI\.PA/)).toBeInTheDocument();
    expect(screen.queryByText("Contrôle mensuel du compte")).not.toBeInTheDocument();
    expect(screen.queryByText("Historique complet")).not.toBeInTheDocument();
    expect(screen.queryByText("À vérifier")).not.toBeInTheDocument();
    expect(cashMonthlyCheck).not.toHaveBeenCalled();
    expect(fullHistoryPreview).not.toHaveBeenCalled();
  });

  it("shows the statement checks once a cash statement has been imported", async () => {
    cashLedger.mockResolvedValue(ledger(true));
    cashMonthlyCheck.mockResolvedValue({ months: [], counts: { ok: 0, mismatch: 0, opening: 0, quiet: 0, missing: 0 } });
    render(<MemoryRouter><MyPeaPage /></MemoryRouter>);
    expect(await screen.findByText("Contrôle mensuel du compte")).toBeInTheDocument();
    expect(fullHistoryPreview).toHaveBeenCalled();
  });
});
