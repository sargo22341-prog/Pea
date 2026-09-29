import type { AlertEvent, AlertEventsPage } from "@pea/shared";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsBell } from "../../components/common/alerts/AlertsBell";

const alertEvents = vi.fn<(limit: number) => Promise<AlertEventsPage>>();
const markAlertEventsRead = vi.fn<() => Promise<undefined>>();

vi.mock("../../lib/api", () => ({
  api: {
    alertEvents: (limit: number) => alertEvents(limit),
    markAlertEventsRead: () => markAlertEventsRead()
  }
}));

function event(overrides: Partial<AlertEvent>): AlertEvent {
  return {
    id: 1,
    alertId: 1,
    symbol: "TTE.PA",
    assetName: "TotalEnergies",
    type: "price_above",
    triggeredAt: "2026-09-29T10:00:00.000Z",
    payload: { price: 61.2, threshold: 60, currency: "EUR" },
    read: false,
    ...overrides
  };
}

describe("AlertsBell", () => {
  beforeEach(() => {
    alertEvents.mockResolvedValue({ events: [event({})], unread: 1 });
    markAlertEventsRead.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the unread counter and the latest triggers", async () => {
    render(<MemoryRouter><AlertsBell /></MemoryRouter>);
    const bell = await screen.findByRole("button", { name: "Alertes, 1 non lue" });
    expect(alertEvents).toHaveBeenCalledWith(5);
    expect(bell).toHaveTextContent("1");

    fireEvent.click(bell);
    expect(screen.getByRole("menu")).toHaveTextContent(/Cours a 61,20\s€, au-dessus de 60,00\s€/);
    expect(screen.getByRole("menuitem", { name: "Voir toutes les alertes" })).toHaveAttribute("href", "/alerts");
  });

  it("reloads when the server signals new alerts and marks them as read", async () => {
    render(<MemoryRouter><AlertsBell /></MemoryRouter>);
    await screen.findByRole("button", { name: "Alertes, 1 non lue" });

    alertEvents.mockResolvedValue({ events: [event({ id: 2 }), event({})], unread: 12 });
    act(() => {
      window.dispatchEvent(new CustomEvent("pea:market-event", { detail: { type: "alerts-triggered" } }));
    });
    expect(await screen.findByRole("button", { name: "Alertes, 12 non lues" }, { timeout: 2000 })).toHaveTextContent("9+");

    alertEvents.mockResolvedValue({ events: [event({ read: true })], unread: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Alertes, 12 non lues" }));
    fireEvent.click(screen.getByRole("button", { name: "Tout marquer comme lu" }));
    await waitFor(() => { expect(markAlertEventsRead).toHaveBeenCalledTimes(1); });
    expect(await screen.findByRole("button", { name: "Alertes" })).not.toHaveTextContent(/\d/);
  });
});
