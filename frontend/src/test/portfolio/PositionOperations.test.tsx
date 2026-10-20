import type { CashLedgerEntry } from "@pea/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditPositionModal } from "../../pages/asset-detail/components/position-editor/EditPositionModal";

const positionTransactions = vi.fn();
const cashLedger = vi.fn();
const correctDividend = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    positionTransactions: (id: number) => positionTransactions(id) as unknown,
    cashLedger: () => cashLedger() as unknown,
    correctDividend: (id: number, input: unknown) => correctDividend(id, input) as unknown
  }
}));

const position = { id: 1, symbol: "TTE.PA", name: "TotalEnergies", quantity: 10, averageBuyPrice: 50, currency: "EUR", createdAt: "2026-01-01T00:00:00.000Z" };
const trade = (id: string, type: "buy" | "sell", price: number) => ({
  id, positionId: 1, assetId: "1", source: "manual", dateExecution: "2026-01-02T10:00:00.000Z", tradedAt: "2026-01-02T10:00:00.000Z",
  assetName: "TotalEnergies", ticker: "TTE.PA", type, quantity: 5, executedPrice: price, price, totalFees: 0, currency: "EUR", createdAt: "2026-01-02T10:00:00.000Z"
});
const dividend = (id: number, positionId: number, verification?: CashLedgerEntry["verification"]): CashLedgerEntry => ({
  id: `movement:${String(id)}`, kind: "dividend", effectiveAt: "2026-03-31T12:00:00.000Z", amount: 38.25, balanceAfter: 100, absorbed: false, source: "pdf", symbol: "TTE.PA", positionId, verification
});

async function renderModal() {
  positionTransactions.mockResolvedValue([trade("tx-1", "buy", 101), trade("tx-2", "sell", 120)]);
  cashLedger.mockResolvedValue({ entries: [
    dividend(7, 1, { status: "document", verifiedAt: "2026-10-20T12:00:00.000Z", reference: "2026-04#1" }),
    dividend(8, 1, { status: "manual", verifiedAt: "2026-10-20T12:00:00.000Z" }),
    dividend(9, 2)
  ] });
  render(<EditPositionModal onClose={vi.fn()} onDeleted={vi.fn()} onSaved={vi.fn()} position={position as never} />);
  await screen.findByDisplayValue("101");
}

describe("opérations d'une position", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("lists the position dividends read-only with their verification badge", async () => {
    await renderModal();
    expect(await screen.findAllByText("Dividende encaissé")).toHaveLength(2);
    expect(screen.getByText("Certifié par relevé")).toHaveAttribute("title", expect.stringContaining("04/2026 n° 1"));
    expect(screen.getByText("Vérifié manuellement")).toBeInTheDocument();
  });

  it("filters buys, sells and dividends", async () => {
    const user = userEvent.setup();
    await renderModal();
    await screen.findAllByText("Dividende encaissé");
    const filters = screen.getByRole("group", { name: "Filtrer les opérations" });

    await user.click(within(filters).getByRole("button", { name: "Ventes" }));
    expect(screen.getByDisplayValue("120")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("101")).not.toBeInTheDocument();
    expect(screen.queryByText("Dividende encaissé")).not.toBeInTheDocument();

    await user.click(within(filters).getByRole("button", { name: "Achats" }));
    expect(screen.getByDisplayValue("101")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("120")).not.toBeInTheDocument();

    await user.click(within(filters).getByRole("button", { name: "Dividendes" }));
    expect(screen.queryByDisplayValue("101")).not.toBeInTheDocument();
    expect(screen.getAllByText("Dividende encaissé")).toHaveLength(2);
    expect(within(filters).getByRole("button", { name: "Dividendes" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the dividend window to correct or verify it", async () => {
    const user = userEvent.setup();
    await renderModal();
    const [open] = await screen.findAllByRole("button", { name: "Ouvrir le dividende" });
    if (!open) throw new Error("bouton attendu");
    await user.click(open);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Corriger" })).toBeInTheDocument();
    expect(within(dialog).getByText("Vérifier avec un relevé")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Corriger" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("le corriger retirera sa certification");

    correctDividend.mockResolvedValue({ entries: [] });
    const amount = within(dialog).getByLabelText("Montant net crédité (€)");
    await user.clear(amount);
    await user.type(amount, "38");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer la correction" }));
    await waitFor(() => { expect(correctDividend).toHaveBeenCalledWith(7, expect.objectContaining({ amount: 38, confirmUncertify: true })); });
  });
});
