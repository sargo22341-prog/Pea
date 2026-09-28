import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { useAdvancedMode } from "../../components/common/disclosure/advanced-mode";

// Le tableau de bord affiche seulement la préférence reçue : c'est l'application, et non la
// fiche actif, qui doit fournir le mode avancé à toutes les pages.
vi.mock("../../pages/dashboard/DashboardPage", () => ({
  DashboardPage: function AdvancedModeProbe() {
    return <p>{useAdvancedMode() ? "advanced on" : "advanced off"}</p>;
  }
}));

class EventSourceMock {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readyState = EventSourceMock.OPEN;
  addEventListener = vi.fn();
  close = vi.fn();
}

function stubSession(advancedModeEnabled: boolean) {
  vi.stubGlobal("EventSource", EventSourceMock);
  Object.defineProperty(window, "EventSource", { configurable: true, value: EventSourceMock });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      setupRequired: false,
      features: [],
      appTimezone: "Europe/Paris",
      user: { id: 1, username: "alice", role: "user", defaultChartRange: "1d", assetNewsEnabled: false, localPeaSearchEnabled: false, advancedModeEnabled }
    })
  }));
}

describe("App – advanced mode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    [true, "advanced on"],
    [false, "advanced off"]
  ])("provides the user's preference (%s) to every page", async (advancedModeEnabled, expected) => {
    stubSession(advancedModeEnabled);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });
});
