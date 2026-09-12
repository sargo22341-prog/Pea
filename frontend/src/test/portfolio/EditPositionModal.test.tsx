import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditPositionModal } from "../../pages/asset-detail/components/EditPositionModal";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: {
    positionTransactions: vi.fn(),
    createPositionTransaction: vi.fn(),
    updatePositionTransaction: vi.fn(),
    deletePositionTransaction: vi.fn()
  }
}));

const position = {
  id: 1,
  symbol: "AI.PA",
  name: "Air Liquide",
  quantity: 10,
  averageBuyPrice: 100,
  currency: "EUR",
  createdAt: "2026-01-01T00:00:00.000Z"
};

const transaction = {
  id: "tx-1",
  positionId: 1,
  assetId: "1",
  source: "manual",
  dateExecution: "2026-01-02T10:00:00.000Z",
  tradedAt: "2026-01-02T10:00:00.000Z",
  assetName: "Air Liquide",
  ticker: "AI.PA",
  type: "buy",
  quantity: 2,
  executedPrice: 101,
  price: 101,
  totalFees: 1.5,
  currency: "EUR",
  createdAt: "2026-01-02T10:00:00.000Z"
};

async function renderModal() {
  vi.mocked(api.positionTransactions).mockResolvedValue([transaction] as never);
  render(<EditPositionModal position={position as never} onClose={vi.fn()} onDeleted={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByDisplayValue("101");
}

describe("EditPositionModal numeric inputs", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not silently convert an empty numeric input to zero", async () => {
    const user = userEvent.setup();
    await renderModal();

    await user.clear(screen.getByLabelText("Prix"));
    await user.click(screen.getByRole("button", { name: /sauver/i }));

    expect(await screen.findByText("Prix requis.")).toBeInTheDocument();
    expect(api.updatePositionTransaction).not.toHaveBeenCalled();
  });

  it("rejects invalid numeric values before calling the API", async () => {
    const user = userEvent.setup();
    await renderModal();

    const price = screen.getByLabelText("Prix");
    await user.clear(price);
    await user.type(price, "abc");
    await user.click(screen.getByRole("button", { name: /sauver/i }));

    expect(await screen.findByText("Prix requis.")).toBeInTheDocument();
    expect(api.updatePositionTransaction).not.toHaveBeenCalled();
  });

  it("parses valid numeric strings on submit", async () => {
    const user = userEvent.setup();
    vi.mocked(api.updatePositionTransaction).mockResolvedValue([transaction] as never);
    await renderModal();

    const price = screen.getByLabelText("Prix");
    await user.clear(price);
    await user.type(price, "123.45");
    await user.click(screen.getByRole("button", { name: /sauver/i }));

    await waitFor(() => expect(api.updatePositionTransaction).toHaveBeenCalled());
    expect(api.updatePositionTransaction).toHaveBeenCalledWith(1, "tx-1", expect.objectContaining({
      quantity: 2,
      price: 123.45,
      totalFees: 1.5
    }));
  });
});

describe("EditPositionModal API outcomes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the server error when saving a transaction is rejected", async () => {
    const user = userEvent.setup();
    vi.mocked(api.updatePositionTransaction).mockRejectedValue(new Error("Cette vente rendrait la quantite detenue negative."));
    await renderModal();

    await user.click(screen.getByRole("button", { name: /sauver/i }));

    expect(await screen.findByText("Cette vente rendrait la quantite detenue negative.")).toBeInTheDocument();
  });

  it("shows the server error when deleting a transaction is rejected", async () => {
    const user = userEvent.setup();
    vi.mocked(api.deletePositionTransaction).mockRejectedValue(new Error("Cette suppression rendrait la quantite detenue negative."));
    const onSaved = vi.fn();
    vi.mocked(api.positionTransactions).mockResolvedValue([transaction] as never);
    render(<EditPositionModal position={position as never} onClose={vi.fn()} onDeleted={vi.fn()} onSaved={onSaved} />);
    await screen.findByDisplayValue("101");

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    const [, confirm] = screen.getAllByRole("button", { name: "Supprimer" });
    await user.click(confirm);

    expect(await screen.findByText("Cette suppression rendrait la quantite detenue negative.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("101")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("lets an existing sale be edited even when it exceeds the remaining quantity", async () => {
    const user = userEvent.setup();
    const sale = { ...transaction, id: "tx-2", type: "sell", quantity: 8, price: 110, executedPrice: 110 };
    vi.mocked(api.positionTransactions).mockResolvedValue([sale] as never);
    vi.mocked(api.updatePositionTransaction).mockResolvedValue([sale] as never);
    render(<EditPositionModal position={{ ...position, quantity: 2 } as never} onClose={vi.fn()} onDeleted={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByDisplayValue("110");

    const price = screen.getByLabelText("Prix");
    await user.clear(price);
    await user.type(price, "112");
    await user.click(screen.getByRole("button", { name: /sauver/i }));

    await waitFor(() => expect(api.updatePositionTransaction).toHaveBeenCalledWith(1, "tx-2", expect.objectContaining({
      type: "sell",
      quantity: 8,
      price: 112
    })));
  });
});
