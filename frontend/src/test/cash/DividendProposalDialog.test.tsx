import { ALERT_LIMITS, type DividendProposal, type DividendProposalsDto } from "@pea/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsBell } from "../../components/common/alerts/AlertsBell";
import { useDividendProposals } from "../../components/common/cash/useDividendProposals";
import { useAlertEvents } from "../../hooks/useAlertEvents";

const dividendProposals = vi.fn<() => Promise<DividendProposalsDto>>();
const acceptDividendProposal = vi.fn<(id: number, input: unknown) => Promise<unknown>>();
const ignoreDividendProposal = vi.fn<(id: number) => Promise<DividendProposalsDto>>();

vi.mock("../../lib/api", () => ({
  api: {
    alertEvents: () => Promise.resolve({ events: [], unread: 0 }),
    dividendProposals: () => dividendProposals(),
    acceptDividendProposal: (id: number, input: unknown) => acceptDividendProposal(id, input),
    ignoreDividendProposal: (id: number) => ignoreDividendProposal(id)
  }
}));

const proposal: DividendProposal = {
  id: 7,
  symbol: "AIR.PA",
  name: "Airbus",
  positionId: 3,
  exDividendAt: "2026-05-13T07:00:00.000Z",
  paymentAt: "2026-05-15T07:00:00.000Z",
  paymentEstimated: true,
  quantity: 8,
  amountPerShare: 1.8,
  currency: "EUR",
  grossAmount: 14.4,
  withholdingRate: 0.15,
  withholdingAmount: 2.16,
  netAmount: 12.24,
  country: "NL",
  withholdingBasis: "isin",
  needsReview: false,
  status: "pending"
};

/** Cloche alimentée comme dans l'en-tête (`Shell`), sans la fonctionnalité Alertes. */
function Bell() {
  return <AlertsBell alerts={useAlertEvents(ALERT_LIMITS.latestEvents, false)} alertsEnabled={false} proposals={useDividendProposals()} />;
}

async function openDialog() {
  render(<MemoryRouter><Bell /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Alertes, 1 non lue" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Dividende AIR\.PA : 12,24\s€ attendus le 15\/05\/2026/ }));
  return screen.getByRole("dialog");
}

describe("DividendProposalDialog", () => {
  beforeEach(() => {
    dividendProposals.mockResolvedValue({ pending: [proposal], ignored: [], cash: 100 });
    acceptDividendProposal.mockResolvedValue({});
    ignoreDividendProposal.mockResolvedValue({ pending: [], ignored: [proposal], cash: 100 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("opens from the bell notification with the calculation and the balance after credit", async () => {
    const dialog = await openDialog();
    expect(dialog).toHaveTextContent("AIR.PA · Airbus");
    expect(dialog).toHaveTextContent(/Retenue à la source estimée \(15 %\)\s*-2,16\s€/);
    expect(dialog).toHaveTextContent(/Solde espèces avant\s*100,00\s€/);
    expect(dialog).toHaveTextContent(/Solde espèces après\s*112,24\s€/);
    expect(screen.queryByRole("link", { name: "Voir toutes les alertes" })).not.toBeInTheDocument();
  });

  it("lets the user correct the prefilled amount and date before saving", async () => {
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Corriger" }));
    const amount = screen.getByLabelText("Montant net crédité (€)");
    expect(amount).toHaveValue(12.24);
    fireEvent.change(amount, { target: { value: "11.9" } });
    expect(screen.getByRole("dialog")).toHaveTextContent(/Solde espèces après\s*111,90\s€/);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la correction" }));

    await waitFor(() => { expect(acceptDividendProposal).toHaveBeenCalledTimes(1); });
    expect(acceptDividendProposal).toHaveBeenCalledWith(7, { amount: 11.9, effectiveAt: expect.any(String) as string });
    await waitFor(() => { expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); });
  });

  it("records nothing when the dialog is cancelled", async () => {
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Corriger" }));
    fireEvent.change(screen.getByLabelText("Montant net crédité (€)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(acceptDividendProposal).not.toHaveBeenCalled();
    expect(ignoreDividendProposal).not.toHaveBeenCalled();
  });

  it("confirms the proposed amount as is, or ignores it", async () => {
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    await waitFor(() => { expect(acceptDividendProposal).toHaveBeenCalledWith(7, {}); });

    await waitFor(() => { expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); });
    fireEvent.click(screen.getByRole("button", { name: "Alertes, 1 non lue" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Dividende AIR\.PA/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ignorer" }));
    await waitFor(() => { expect(ignoreDividendProposal).toHaveBeenCalledWith(7); });
  });
});
