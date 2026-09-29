import type { AlertEventsPage, AlertParams, AlertType, UserAlert } from "@pea/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateAlertModal } from "../../pages/asset-detail/components/alerts/CreateAlertModal";
import { AlertsPage } from "../../pages/alerts/AlertsPage";

const alerts = vi.fn<() => Promise<UserAlert[]>>();
const updateAlert = vi.fn<(id: number, changes: { active?: boolean }) => Promise<UserAlert>>();
const deleteAlert = vi.fn<(id: number) => Promise<undefined>>();
const createAlert = vi.fn<(input: { symbol: string; type: AlertType; params: AlertParams }) => Promise<UserAlert>>();
const alertEvents = vi.fn<() => Promise<AlertEventsPage>>();

vi.mock("../../lib/api", () => ({
  api: {
    alerts: () => alerts(),
    updateAlert: (id: number, changes: { active?: boolean }) => updateAlert(id, changes),
    deleteAlert: (id: number) => deleteAlert(id),
    createAlert: (input: { symbol: string; type: AlertType; params: AlertParams }) => createAlert(input),
    alertEvents: () => alertEvents(),
    markAlertEventsRead: vi.fn(() => Promise.resolve(undefined))
  }
}));
vi.mock("../../hooks/useAuthenticatedImageUrl", () => ({ useAuthenticatedImageUrl: () => null }));

const priceAlert: UserAlert = { id: 3, symbol: "TTE.PA", assetName: "TotalEnergies", currency: "EUR", type: "price_above", params: { threshold: 60 }, active: true, createdAt: "2026-09-20T10:00:00.000Z" };

describe("AlertsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    alerts.mockResolvedValue([priceAlert]);
    updateAlert.mockResolvedValue({ ...priceAlert, active: false });
    deleteAlert.mockResolvedValue(undefined);
    alertEvents.mockResolvedValue({
      unread: 1,
      events: [{ id: 9, alertId: 3, symbol: "TTE.PA", assetName: "TotalEnergies", type: "recommendation_change", triggeredAt: "2026-09-29T10:00:00.000Z", payload: { previousKey: "hold", recommendationKey: "buy" }, read: false }]
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists the alerts, pauses one and deletes another after confirmation", async () => {
    render(<MemoryRouter><AlertsPage /></MemoryRouter>);
    expect(await screen.findByText(/Cours au-dessus de 60,00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Activer ou suspendre l'alerte sur TotalEnergies" }));
    await waitFor(() => { expect(updateAlert).toHaveBeenCalledWith(3, { active: false }); });

    fireEvent.click(screen.getByRole("button", { name: "Supprimer l'alerte sur TotalEnergies" }));
    expect(deleteAlert).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => { expect(deleteAlert).toHaveBeenCalledWith(3); });
  });

  it("shows the history with translated recommendations", async () => {
    render(<MemoryRouter><AlertsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("tab", { name: "Historique (1 non lue)" }));
    expect(await screen.findByText("Recommandation : Conserver → Acheter")).toBeInTheDocument();
    expect(localStorage.getItem("pea.alerts.tab")).toBe("history");
  });
});

describe("CreateAlertModal", () => {
  beforeEach(() => {
    localStorage.clear();
    createAlert.mockImplementation((input) => Promise.resolve({ ...priceAlert, type: input.type, params: input.params }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("prefills the current price, sends only the parameters of the chosen type and confirms", async () => {
    render(<MemoryRouter><CreateAlertModal currency="EUR" currentPrice={61.234} name="TotalEnergies" onClose={vi.fn()} symbol="TTE.PA" /></MemoryRouter>);
    expect(screen.getByLabelText("Seuil (EUR)")).toHaveValue(61.234);

    fireEvent.change(screen.getByLabelText("Declencher quand"), { target: { value: "ma200_cross" } });
    expect(screen.queryByLabelText("Seuil (EUR)")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Sens"), { target: { value: "down" } });
    fireEvent.click(screen.getByRole("button", { name: "Creer l'alerte" }));

    expect(await screen.findByText("Alerte creee : Passage sous la moyenne mobile 200 jours.")).toBeInTheDocument();
    expect(createAlert).toHaveBeenCalledWith({ symbol: "TTE.PA", type: "ma200_cross", params: { direction: "down" } });
  });

  it("uses a percentage for the daily change, keeps the cooldown folded and shows API errors", async () => {
    createAlert.mockRejectedValue(new Error("Seuil hors des bornes autorisees."));
    render(<MemoryRouter><CreateAlertModal currency="EUR" currentPrice={61} name="TotalEnergies" onClose={vi.fn()} symbol="TTE.PA" /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Declencher quand"), { target: { value: "daily_change" } });
    expect(screen.getByLabelText("Variation absolue (%)")).toHaveValue(5);
    expect(screen.queryByLabelText("Anti-rebond (heures)")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Options avancees" }));
    fireEvent.change(screen.getByLabelText("Anti-rebond (heures)"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Creer l'alerte" }));

    expect(await screen.findByText("Seuil hors des bornes autorisees.")).toBeInTheDocument();
    expect(createAlert).toHaveBeenCalledWith({ symbol: "TTE.PA", type: "daily_change", params: { threshold: 5, cooldownHours: 6 } });
  });
});
