import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioCalendarEvents } from "../../components/common/AssetCalendarEvents";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({ api: { calendarEvents: vi.fn() } }));
vi.mock("../../hooks/useAuthenticatedImageUrl", () => ({ useAuthenticatedImageUrl: () => null }));

const DAY_MS = 24 * 60 * 60 * 1000;

describe("portfolio calendar estimates", () => {
  beforeEach(() => {
    // jsdom n'implémente pas le défilement : la frise centre pourtant le prochain évènement.
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    vi.clearAllMocks();
  });

  it("shows the consensus under an upcoming publication only", async () => {
    vi.mocked(api.calendarEvents).mockResolvedValue([
      { id: 1, symbol: "AI.PA", eventType: "earnings", eventDate: new Date(Date.now() + 5 * DAY_MS).toISOString(), isEstimate: true, assetName: "Air Liquide", currency: "EUR", epsAverage: 1.25, revenueAverage: 7_000_000_000 },
      { id: 2, symbol: "MC.PA", eventType: "earnings", eventDate: new Date(Date.now() - 5 * DAY_MS).toISOString(), isEstimate: false, assetName: "LVMH", currency: "EUR", epsAverage: 9 }
    ]);

    render(<PortfolioCalendarEvents />);

    expect(await screen.findByText(/BPA attendu 1,25.*CA attendu 7/)).toBeInTheDocument();
    expect(screen.getByText("LVMH")).toBeInTheDocument();
    expect(screen.queryByText(/BPA attendu 9/)).not.toBeInTheDocument();
  });
});
