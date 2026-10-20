import { ALERT_LIMITS, type DividendProposal, type DividendProposalsDto, type DividendSettings } from "@pea/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsBell } from "../../components/common/alerts/AlertsBell";
import { useDividendProposals } from "../../components/common/cash/useDividendProposals";
import { useAlertEvents } from "../../hooks/useAlertEvents";
import { DividendSettingsSection } from "../../pages/settings/components/DividendSettingsSection";

const dividendProposals = vi.fn<() => Promise<DividendProposalsDto>>();
const correctDividendProposal = vi.fn<(id: number, input: unknown) => Promise<unknown>>();
const markDividendNotificationsRead = vi.fn<() => Promise<DividendProposalsDto>>();
const setPositionIsin = vi.fn<(positionId: number, isin: string | null) => Promise<unknown>>();
const dividendSettings = vi.fn<() => Promise<DividendSettings>>();
const updateDividendSettings = vi.fn<(settings: DividendSettings) => Promise<DividendSettings>>();

vi.mock("../../lib/api", () => ({
  api: {
    alertEvents: () => Promise.resolve({ events: [], unread: 0 }),
    dividendProposals: () => dividendProposals(),
    correctDividendProposal: (id: number, input: unknown) => correctDividendProposal(id, input),
    markDividendNotificationsRead: () => markDividendNotificationsRead(),
    setPositionIsin: (positionId: number, isin: string | null) => setPositionIsin(positionId, isin),
    dividendSettings: () => dividendSettings(),
    updateDividendSettings: (settings: DividendSettings) => updateDividendSettings(settings)
  }
}));

const base: DividendProposal = {
  id: 1,
  symbol: "TTE.PA",
  name: "TotalEnergies",
  positionId: 4,
  exDividendAt: "2026-06-18T07:00:00.000Z",
  paymentAt: "2026-06-22T07:00:00.000Z",
  paymentEstimated: false,
  quantity: 10,
  amountPerShare: 0.85,
  currency: "EUR",
  grossAmount: 8.5,
  withholdingRate: 0,
  withholdingAmount: 0,
  netAmount: 8.5,
  country: "FR",
  withholdingBasis: "isin",
  needsReview: false,
  status: "accepted",
  decidedAt: "2026-06-22T08:00:00.000Z",
  autoAccepted: true,
  notificationRead: false,
  creditedAmount: 8.5,
  creditedAt: "2026-06-22T07:00:00.000Z"
};
const toReview: DividendProposal = { ...base, id: 2, symbol: "AIR.PA", name: "Airbus", status: "pending", autoAccepted: false, withholdingBasis: "listing", needsReview: true, creditedAmount: undefined, creditedAt: undefined };

function Bell() {
  return <AlertsBell alerts={useAlertEvents(ALERT_LIMITS.latestEvents, false)} alertsEnabled={false} proposals={useDividendProposals()} />;
}

describe("dividendes ajoutés automatiquement", () => {
  beforeEach(() => {
    dividendProposals.mockResolvedValue({ pending: [toReview], ignored: [], recent: [base], unreadAutoAccepted: 1, cash: 108.5 });
    correctDividendProposal.mockResolvedValue({});
    markDividendNotificationsRead.mockResolvedValue({ pending: [toReview], ignored: [], recent: [{ ...base, notificationRead: true }], unreadAutoAccepted: 0, cash: 108.5 });
    setPositionIsin.mockResolvedValue({ positionId: 4, isin: "NL0000235190" });
    dividendSettings.mockResolvedValue({ autoAccept: false });
    updateDividendSettings.mockResolvedValue({ autoAccept: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("notifies the automatic addition and lets the user correct the recorded movement", async () => {
    render(<MemoryRouter><Bell /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Alertes, 2 non lues" }));
    expect(screen.getByRole("menuitem", { name: /Dividende AIR\.PA : 8,50\s€ attendus/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Dividende TTE\.PA : 8,50\s€ ajouté automatiquement/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Ajouté automatiquement le 22/06/2026");
    expect(dialog).toHaveTextContent(/Solde espèces avant\s*100,00\s€/);
    expect(screen.queryByRole("button", { name: "Ignorer" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Montant net crédité (€)"), { target: { value: "8.1" } });
    expect(dialog).toHaveTextContent(/Solde espèces après\s*108,10\s€/);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la correction" }));
    await waitFor(() => { expect(correctDividendProposal).toHaveBeenCalledWith(1, { amount: 8.1, effectiveAt: expect.any(String) as string }); });
  });

  it("marks the automatic additions as read", async () => {
    render(<MemoryRouter><Bell /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Alertes, 2 non lues" }));
    dividendProposals.mockResolvedValue({ pending: [toReview], ignored: [], recent: [{ ...base, notificationRead: true }], unreadAutoAccepted: 0, cash: 108.5 });
    fireEvent.click(screen.getByRole("button", { name: "Tout marquer comme lu" }));
    await waitFor(() => { expect(markDividendNotificationsRead).toHaveBeenCalledTimes(1); });
    expect(await screen.findByRole("button", { name: "Alertes, 1 non lue" })).toBeInTheDocument();
  });

  it("saves the ISIN of a position whose country is uncertain", async () => {
    render(<MemoryRouter><Bell /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Alertes, 2 non lues" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Dividende AIR\.PA/ }));
    const isin = screen.getByLabelText(/ISIN de la société/);
    fireEvent.change(isin, { target: { value: "nl123" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer l'ISIN" }));
    expect(await screen.findByText(/ISIN invalide/)).toBeInTheDocument();
    expect(setPositionIsin).not.toHaveBeenCalled();
    fireEvent.change(isin, { target: { value: "nl0000235190" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer l'ISIN" }));
    await waitFor(() => { expect(setPositionIsin).toHaveBeenCalledWith(4, "NL0000235190"); });
  });

  it("toggles the automatic addition setting", async () => {
    render(<DividendSettingsSection open />);
    const toggle = await screen.findByRole("switch", { name: "Ajouter automatiquement les dividendes sûrs" });
    await waitFor(() => { expect(toggle).toHaveAttribute("aria-checked", "false"); });
    fireEvent.click(toggle);
    await waitFor(() => { expect(updateDividendSettings).toHaveBeenCalledWith({ autoAccept: true }); });
    await waitFor(() => { expect(toggle).toHaveAttribute("aria-checked", "true"); });
  });
});
