import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-core";
import { api } from "../../lib/api";
import { EditPositionModal } from "../../pages/asset-detail/components/position-editor/EditPositionModal";

vi.mock("../../lib/api", () => ({
  api: {
    positionTransactions: vi.fn(),
    createPositionTransaction: vi.fn(),
    updatePositionTransaction: vi.fn(),
    deletePositionTransaction: vi.fn(),
    cashLedger: vi.fn(() => Promise.resolve({ entries: [] }))
  }
}));

const position = { id: 1, symbol: "AI.PA", name: "Air Liquide", quantity: 10, averageBuyPrice: 100, currency: "EUR", createdAt: "2026-01-01T00:00:00.000Z" };
const transaction = {
  id: "tx-1", positionId: 1, assetId: "1", source: "manual", dateExecution: "2026-01-02T10:00:00.000Z", tradedAt: "2026-01-02T10:00:00.000Z",
  assetName: "Air Liquide", ticker: "AI.PA", type: "buy", quantity: 2, executedPrice: 101, price: 101, totalFees: 1.5, currency: "EUR", createdAt: "2026-01-02T10:00:00.000Z"
};
const duplicateRefusal = () => new ApiError(409, "Une operation identique existe deja sur cette position.", { details: { code: "DUPLICATE_TRANSACTION", transactionId: 7 } });

async function renderAndSave() {
  const user = userEvent.setup();
  vi.mocked(api.positionTransactions).mockResolvedValue([transaction] as never);
  render(<EditPositionModal position={position as never} onClose={vi.fn()} onDeleted={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByDisplayValue("101");
  await user.click(screen.getByRole("button", { name: /sauver/i }));
  return user;
}

describe("EditPositionModal duplicate operations", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("asks before saving an operation identical to a recorded one, then resends it with the explicit consent", async () => {
    vi.mocked(api.updatePositionTransaction).mockRejectedValueOnce(duplicateRefusal()).mockResolvedValueOnce([transaction] as never);
    const user = await renderAndSave();

    expect(await screen.findByText("Operation deja enregistree ?")).toBeInTheDocument();
    expect(api.updatePositionTransaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.updatePositionTransaction).mock.calls[0]?.[2]).not.toHaveProperty("confirmDuplicate");

    await user.click(screen.getByRole("button", { name: "Enregistrer quand meme" }));

    await waitFor(() => { expect(api.updatePositionTransaction).toHaveBeenCalledTimes(2); });
    expect(api.updatePositionTransaction).toHaveBeenLastCalledWith(1, "tx-1", expect.objectContaining({ confirmDuplicate: true }));
  });

  it("does not resend the operation when the duplicate warning is dismissed", async () => {
    vi.mocked(api.updatePositionTransaction).mockRejectedValueOnce(duplicateRefusal());
    const user = await renderAndSave();

    await screen.findByText("Operation deja enregistree ?");
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.queryByText("Operation deja enregistree ?")).not.toBeInTheDocument();
    expect(api.updatePositionTransaction).toHaveBeenCalledTimes(1);
  });
});
