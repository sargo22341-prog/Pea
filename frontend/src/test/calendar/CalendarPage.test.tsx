import type { CalendarEvent, CalendarScope } from "@pea/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyContext } from "../../contexts/privacy-context";
import { CalendarPage } from "../../pages/calendar/CalendarPage";

const calendarRange = vi.fn<(range: { scope: CalendarScope; from: string; to: string }) => Promise<CalendarEvent[]>>();

vi.mock("../../lib/api", () => ({
  api: {
    calendarRange: (range: { scope: CalendarScope; from: string; to: string }) => calendarRange(range),
    calendarIcs: vi.fn()
  }
}));
vi.mock("../../hooks/useAuthenticatedImageUrl", () => ({ useAuthenticatedImageUrl: () => null }));

const events: CalendarEvent[] = [
  { id: 1, symbol: "TTE.PA", eventType: "ex_dividend", eventDate: "2026-09-10T00:00:00.000Z", isEstimate: false, assetName: "TotalEnergies", currency: "EUR", expectedDividend: { amount: 85, amountPerShare: 0.85, quantity: 100, currency: "EUR", status: "announced" } },
  { id: 2, symbol: "AI.PA", eventType: "earnings", eventDate: "2026-09-10T00:00:00.000Z", isEstimate: true, assetName: "Air Liquide", currency: "EUR", epsAverage: 1.25, revenueAverage: 7_000_000_000 }
];

function renderPage(privacyEnabled = false) {
  render(
    <PrivacyContext.Provider value={{ privacyEnabled }}>
      <MemoryRouter>
        <CalendarPage appTimezone="Europe/Paris" />
      </MemoryRouter>
    </PrivacyContext.Provider>
  );
}

describe("CalendarPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-09-15T10:00:00.000Z"), toFake: ["Date"] });
    localStorage.clear();
    calendarRange.mockResolvedValue(events);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("loads the whole month grid for the portfolio and opens the day detail", async () => {
    renderPage();
    const day = await screen.findByRole("button", { name: /10 septembre, 2 evenements/ });
    expect(calendarRange).toHaveBeenCalledWith({ scope: "portfolio", from: "2026-08-31", to: "2026-10-04" });

    fireEvent.click(day);
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("TotalEnergies")).toBeInTheDocument();
    expect(within(panel).getByText(/Montant attendu \(annonce\) : 85,00/)).toBeInTheDocument();
    expect(within(panel).queryByText("BPA attendu")).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Afficher les estimations" }));
    expect(within(panel).getByText("BPA attendu")).toBeInTheDocument();
    expect(within(panel).getByText(/1,25/)).toBeInTheDocument();
  });

  it("masks the expected dividend in privacy mode", async () => {
    renderPage(true);
    fireEvent.click(await screen.findByRole("button", { name: /10 septembre/ }));
    expect(screen.getByText("Montant attendu (annonce) : ••••")).toBeInTheDocument();
  });

  it("hides a filtered event type and reloads when the scope changes", async () => {
    renderPage();
    await screen.findByRole("button", { name: /10 septembre, 2 evenements/ });

    fireEvent.click(screen.getByRole("button", { name: "Resultats" }));
    expect(screen.getByRole("button", { name: /10 septembre, 1 evenement$/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Suivi" }));
    await screen.findByRole("button", { name: /10 septembre, 1 evenement$/ });
    expect(calendarRange).toHaveBeenLastCalledWith({ scope: "watchlist", from: "2026-08-31", to: "2026-10-04" });
    expect(localStorage.getItem("pea.calendar.scope")).toBe("watchlist");
  });

  it("lists the days of the month in list view and says when nothing is planned", async () => {
    renderPage();
    await screen.findByRole("button", { name: /10 septembre/ });
    fireEvent.click(screen.getByRole("tab", { name: "Liste" }));
    expect(screen.getByRole("heading", { name: /jeudi 10 septembre 2026/i })).toBeInTheDocument();

    calendarRange.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Mois suivant" }));
    expect(await screen.findByText("Aucun evenement ce mois-ci pour ces filtres.")).toBeInTheDocument();
  });
});
