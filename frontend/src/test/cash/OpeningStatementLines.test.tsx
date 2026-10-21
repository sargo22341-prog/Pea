import type { CashLedgerDto, CashLedgerEntry } from "@pea/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivacyContext } from "../../contexts/privacy-context";
import { EditPositionModal } from "../../pages/asset-detail/components/position-editor/EditPositionModal";
import { LedgerTable } from "../../pages/pea/components/LedgerTable";
import { OpeningDividendsCard } from "../../pages/pea/components/OpeningDividendsCard";

const cashLedger = vi.fn<() => Promise<CashLedgerDto>>();
const positionTransactions = vi.fn<() => Promise<unknown[]>>();

vi.mock("../../lib/api", () => ({
  api: {
    cashLedger: () => cashLedger(),
    positionTransactions: () => positionTransactions()
  }
}));

const certified = { status: "document" as const, verifiedAt: "2026-10-20T12:00:00.000Z", reference: "2024-05#4" };
const statementLine: CashLedgerEntry = {
  id: "statement-line:12", kind: "dividend", effectiveAt: "2024-05-03T12:00:00.000Z", amount: 8.4, balanceAfter: 50, absorbed: true,
  source: "statement", symbol: "BN.PA", name: "Danone", positionId: 1, isin: "FR0000120644", verification: certified
};
const unmatchedLine: CashLedgerEntry = { ...statementLine, id: "statement-line:13", symbol: undefined, name: "ENGIE", positionId: undefined, isin: "FR0010208488", amount: 81.31 };
const movement: CashLedgerEntry = { id: "movement:3", kind: "dividend", effectiveAt: "2026-03-31T12:00:00.000Z", amount: 38.25, balanceAfter: 138.25, absorbed: false, source: "manual", symbol: "BN.PA", positionId: 1 };

const ledger: CashLedgerDto = {
  summary: { status: "ready", referenceAt: "2026-03-01T00:00:00.000Z", cash: 138.25, deposits: 100, withdrawals: 0, netDeposits: 100, cashDividends: 128.0, otherCredits: 0, standaloneFees: 0, depositCeiling: 150_000, remainingCeiling: 149_900, realizedGain: 0, historyIncomplete: true },
  settings: { status: "ready", referenceAt: "2026-03-01T00:00:00.000Z", openingCash: 100, openingDeposits: 100, openingWithdrawals: 0, openingDividends: 89.71 },
  cashStatementsImported: false,
  entries: [movement, unmatchedLine, statementLine]
};

function rowOf(text: string, exact = false) {
  const row = screen.getByText(text, { exact }).closest("tr");
  if (!row) throw new Error(`ligne attendue : ${text}`);
  return row;
}

describe("dividendes perçus avant la date de départ, certifiés par relevé", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("shows them greyed in the history, with the mention and the badge, without any action", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><LedgerTable ledger={ledger} onChanged={vi.fn()} /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Dividende encaissé" }));

    const line = rowOf("BN.PA - Danone");
    expect(line).toHaveClass("opacity-60");
    expect(within(line).getByText("(avant la date de départ)")).toBeInTheDocument();
    expect(within(line).getByText("Relevé de coupons")).toBeInTheDocument();
    expect(within(line).getByText("Certifié par relevé")).toHaveAttribute("title", expect.stringContaining("05/2024 n° 4"));
    expect(within(line).queryAllByRole("button")).toHaveLength(0);
    expect(within(line).queryAllByRole("link")).toHaveLength(0);
    expect(within(rowOf("ENGIE (FR0010208488)")).queryAllByRole("button")).toHaveLength(0);

    const recorded = rowOf("BN.PA", true);
    expect(recorded).not.toHaveClass("opacity-60");
    expect(within(recorded).getAllByRole("button")).toHaveLength(2);
  });

  it("hides their amounts in privacy mode", () => {
    render(
      <PrivacyContext.Provider value={{ privacyEnabled: true }}>
        <MemoryRouter><LedgerTable ledger={ledger} onChanged={vi.fn()} /></MemoryRouter>
      </PrivacyContext.Provider>
    );
    expect(within(rowOf("BN.PA - Danone")).getAllByText("••••")).toHaveLength(2);
    expect(screen.queryByText(/8,40/)).not.toBeInTheDocument();
  });

  it("lists them read-only among the position dividends", async () => {
    const user = userEvent.setup();
    positionTransactions.mockResolvedValue([]);
    cashLedger.mockResolvedValue(ledger);
    const position = { id: 1, symbol: "BN.PA", name: "Danone", quantity: 4, averageBuyPrice: 50, currency: "EUR", createdAt: "2024-01-01T00:00:00.000Z" };
    render(<EditPositionModal onClose={vi.fn()} onDeleted={vi.fn()} onSaved={vi.fn()} position={position as never} />);
    await user.click(within(screen.getByRole("group", { name: "Filtrer les opérations" })).getByRole("button", { name: "Dividendes" }));

    const mention = await screen.findByText("(avant la date de départ)");
    const row = mention.parentElement?.parentElement;
    if (!row) throw new Error("ligne attendue");
    expect(row).toHaveClass("opacity-60");
    expect(within(row).getByText("Certifié par relevé")).toBeInTheDocument();
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Ouvrir le dividende" })).toHaveLength(1);
  });

  it("states how many certified statement lines back the amount", () => {
    render(<OpeningDividendsCard certifiedAt="2026-10-20T12:00:00.000Z" certifiedLines={7} declared={262.67} onSaved={vi.fn()} referenceAt="2026-03-01T00:00:00.000Z" startEditing={false} />);
    expect(screen.getByText(/7 lignes de relevé certifiées/)).toBeInTheDocument();
  });
});
