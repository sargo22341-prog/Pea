import type { CashLedgerDto, CashLedgerEntry } from "@pea/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CashStatementBadge } from "../../../components/common/cash/verification/CashStatementBadge";
import { changeAppLanguage } from "../../../i18n";
import enCash from "../../../i18n/locales/en/cash.json";
import frCash from "../../../i18n/locales/fr/cash.json";
import { api } from "../../../lib/api";
import { ApiError } from "../../../lib/api-core";
import { EditPositionModal } from "../../../pages/asset-detail/components/position-editor/EditPositionModal";
import { LedgerTable } from "../../../pages/pea/components/LedgerTable";

vi.mock("../../../lib/api", () => ({
  api: {
    deleteCashMovement: vi.fn(),
    positionTransactions: vi.fn(),
    updatePositionTransaction: vi.fn(),
    deletePositionTransaction: vi.fn(),
    cashLedger: vi.fn(() => Promise.resolve({ entries: [] }))
  }
}));

const verified = { status: "verified" as const, reference: "2026-03#2", verifiedAt: "2026-10-20T12:00:00.000Z" };
const entry = (id: string, cashCheck: CashLedgerEntry["cashCheck"], amount: number): CashLedgerEntry => ({ id, kind: "deposit", effectiveAt: "2026-03-17T08:00:00.000Z", amount, balanceAfter: 100, absorbed: false, source: "manual", cashCheck });
const ledger: CashLedgerDto = {
  summary: { status: "ready", cash: 100, deposits: 100, withdrawals: 0, netDeposits: 100, cashDividends: 0, otherCredits: 0, standaloneFees: 0, depositCeiling: 150_000, remainingCeiling: 149_900, realizedGain: 0, historyIncomplete: false },
  settings: { status: "ready", openingCash: 0, openingDeposits: 0, openingWithdrawals: 0 },
  entries: [entry("movement:1", verified, 2000), entry("movement:2", { status: "not_found" }, 500), entry("movement:3", { status: "to_verify" }, 300)]
};
const position = { id: 1, symbol: "AI.PA", name: "Air Liquide", quantity: 10, averageBuyPrice: 100, currency: "EUR", createdAt: "2026-01-01T00:00:00.000Z" };
const transaction = {
  id: "tx-1", positionId: 1, assetId: "1", source: "manual", dateExecution: "2026-01-02T10:00:00.000Z", tradedAt: "2026-01-02T10:00:00.000Z",
  assetName: "Air Liquide", ticker: "AI.PA", type: "buy", quantity: 2, executedPrice: 101, price: 101, totalFees: 1.5, currency: "EUR", createdAt: "2026-01-02T10:00:00.000Z", cashCheck: verified
};

function rowWith(amount: RegExp) {
  const row = screen.getByText(amount).closest("tr");
  if (!row) throw new Error("ligne attendue");
  return row;
}

function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key));
}

describe("contrôle par les relevés espèces", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("shows the verified, to-verify and not-found badges in the history", () => {
    render(<MemoryRouter><LedgerTable ledger={ledger} onChanged={vi.fn()} /></MemoryRouter>);
    expect(within(rowWith(/2\s000,00/)).getByText("Vérifié par relevé espèces")).toHaveAttribute("title", expect.stringContaining("03/2026 n° 2"));
    expect(within(rowWith(/\+500,00/)).getByText("Non retrouvé au relevé")).toHaveAttribute("title", expect.stringContaining("doublon"));
    expect(within(rowWith(/\+300,00/)).getByText("À vérifier")).toBeInTheDocument();
  });

  it("warns before deleting a verified movement and sends the explicit consent", async () => {
    const user = userEvent.setup();
    vi.mocked(api.deleteCashMovement).mockResolvedValue(ledger);
    render(<MemoryRouter><LedgerTable ledger={ledger} onChanged={vi.fn()} /></MemoryRouter>);
    await user.click(within(rowWith(/2\s000,00/)).getByRole("button", { name: "Supprimer" }));
    expect(screen.getByText(/retirera cette vérification/)).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => { expect(api.deleteCashMovement).toHaveBeenCalledWith(1, true); });

    await user.click(within(rowWith(/\+300,00/)).getByRole("button", { name: "Supprimer" }));
    expect(screen.queryByText(/retirera cette vérification/)).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => { expect(api.deleteCashMovement).toHaveBeenLastCalledWith(3, false); });
  });

  it("shows the badge on a position operation and asks before editing a verified one", async () => {
    const user = userEvent.setup();
    vi.mocked(api.positionTransactions).mockResolvedValue([transaction] as never);
    vi.mocked(api.updatePositionTransaction)
      .mockRejectedValueOnce(new ApiError(409, "Opération vérifiée", { details: { code: "CASH_STATEMENT_VERIFIED", reference: "2026-03#2" } }))
      .mockResolvedValueOnce([transaction] as never);
    render(<EditPositionModal position={position as never} onClose={vi.fn()} onDeleted={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByDisplayValue("101");
    expect(screen.getByText("Vérifié par relevé espèces")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sauver/i }));
    expect(await screen.findByText("Opération vérifiée par relevé espèces")).toBeInTheDocument();
    expect(vi.mocked(api.updatePositionTransaction).mock.calls[0]?.[2]).not.toHaveProperty("confirmUnverify");
    await user.click(screen.getByRole("button", { name: "Modifier quand même" }));
    await waitFor(() => { expect(api.updatePositionTransaction).toHaveBeenLastCalledWith(1, "tx-1", expect.objectContaining({ confirmUnverify: true })); });
  });

  it("warns before deleting a verified operation and sends the consent", async () => {
    const user = userEvent.setup();
    vi.mocked(api.positionTransactions).mockResolvedValue([transaction] as never);
    vi.mocked(api.deletePositionTransaction).mockResolvedValue(undefined);
    render(<EditPositionModal position={position as never} onClose={vi.fn()} onDeleted={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByDisplayValue("101");
    const [deleteButton] = screen.getAllByRole("button", { name: "Supprimer" });
    if (!deleteButton) throw new Error("bouton de suppression attendu");
    await user.click(deleteButton);
    expect(screen.getByText(/retirera cette vérification/)).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => { expect(api.deletePositionTransaction).toHaveBeenCalledWith(1, "tx-1", true); });
  });

  it("is translated in English with the same keys as in French", async () => {
    expect(keysOf(enCash.cashStatements).sort()).toEqual(keysOf(frCash.cashStatements).sort());
    await changeAppLanguage("en");
    try {
      render(<CashStatementBadge check={{ status: "not_found" }} />);
      expect(screen.getByText("Not found on statement")).toBeInTheDocument();
    } finally {
      await changeAppLanguage("fr");
    }
  });
});
