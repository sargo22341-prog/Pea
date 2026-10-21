import type { CashLedgerDto, OpeningDividendsEstimate } from "@pea/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpeningDividendsStep } from "../../components/common/cash/OpeningDividendsStep";

const openingDividendsEstimate = vi.fn<() => Promise<OpeningDividendsEstimate>>();
const confirmOpeningDividends = vi.fn<(amount: number | null) => Promise<CashLedgerDto>>();

vi.mock("../../lib/api", () => ({
  api: {
    openingDividendsEstimate: () => openingDividendsEstimate(),
    confirmOpeningDividends: (amount: number | null) => confirmOpeningDividends(amount)
  }
}));

const estimate: OpeningDividendsEstimate = {
  referenceAt: "2026-03-01T00:00:00.000Z",
  cash: 450,
  netDeposits: 1000,
  buys: 600,
  sells: 40,
  otherCredits: 0,
  standaloneFees: 0,
  implied: 10,
  publishedGross: 10,
  publishedNet: 10,
  warnings: []
};

describe("OpeningDividendsStep", () => {
  beforeEach(() => {
    openingDividendsEstimate.mockResolvedValue(estimate);
    confirmOpeningDividends.mockResolvedValue({} as CashLedgerDto);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the calculation and saves the corrected amount", async () => {
    const onDone = vi.fn();
    render(<OpeningDividendsStep onDone={onDone} />);
    expect(await screen.findByText(/Dividendes déduits/)).toBeInTheDocument();
    expect(screen.getByText(/Achats enregistrés/).parentElement).toHaveTextContent(/\+ 600,00\s€/);
    const amount = screen.getByLabelText("Dividendes perçus à enregistrer (€)");
    expect(amount).toHaveValue(10);
    fireEvent.change(amount, { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    await waitFor(() => { expect(confirmOpeningDividends).toHaveBeenCalledWith(12.5); });
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it("warns when the history is inconsistent and records nothing when skipped", async () => {
    openingDividendsEstimate.mockResolvedValue({ ...estimate, implied: -50, publishedNet: 30, warnings: ["negative"] });
    const onDone = vi.fn();
    render(<OpeningDividendsStep onDone={onDone} />);
    expect(await screen.findByText(/Le calcul est négatif/)).toBeInTheDocument();
    expect(screen.getByLabelText("Dividendes perçus à enregistrer (€)")).toHaveValue(30);
    fireEvent.click(screen.getByRole("button", { name: "Passer" }));
    expect(onDone).toHaveBeenCalledWith(false);
    expect(confirmOpeningDividends).not.toHaveBeenCalled();
  });
});
