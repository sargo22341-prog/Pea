import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

class EventSourceMock {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readyState = EventSourceMock.OPEN;
  url: string;
  withCredentials: boolean;
  addEventListener = vi.fn();
  close = vi.fn(() => {
    this.readyState = EventSourceMock.CLOSED;
  });

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = Boolean(init?.withCredentials);
  }
}

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe("App – auth gate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows loading state while /api/auth/me is in flight", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => new Promise(() => {}))
    );
    renderApp();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it("shows setup form when setupRequired is true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ setupRequired: true, user: null, appTimezone: "Europe/Paris" })
      })
    );
    renderApp();
    await waitFor(() => {
      expect(screen.getByText("Creer le premier compte")).toBeInTheDocument();
    });
  });

  it("shows login form when user is not authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ setupRequired: false, user: null, appTimezone: "Europe/Paris" })
      })
    );
    renderApp();
    await waitFor(() => {
      expect(screen.getByText("Connexion")).toBeInTheDocument();
    });
  });

  it("renders the main app shell when user is authenticated", async () => {
    const eventSourceSpy = vi.fn();
    class TestEventSource extends EventSourceMock {
      constructor(url: string, init?: EventSourceInit) {
        super(url, init);
        eventSourceSpy(url, init);
      }
    }
    Object.assign(TestEventSource, {
      CONNECTING: EventSourceMock.CONNECTING,
      OPEN: EventSourceMock.OPEN,
      CLOSED: EventSourceMock.CLOSED
    });
    vi.stubGlobal("EventSource", TestEventSource);
    Object.defineProperty(window, "EventSource", { configurable: true, value: TestEventSource });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          setupRequired: false,
          user: {
            id: 1,
            username: "alice",
            role: "user",
            defaultChartRange: "1d",
            assetNewsEnabled: true,
            localPeaSearchEnabled: true,
            newsLanguageFrEnabled: true,
            newsLanguageEnEnabled: false,
            dashboardDefaultSortKey: "name",
            dashboardDefaultSortDirection: "asc"
          },
          appTimezone: "Europe/Paris"
        })
      })
    );
    renderApp();
    await waitFor(() => {
      expect(screen.queryByText("Connexion")).not.toBeInTheDocument();
      expect(screen.queryByText("Creer le premier compte")).not.toBeInTheDocument();
    });
    await waitFor(() => expect(eventSourceSpy).toHaveBeenCalledWith("/api/market/events", { withCredentials: true }));
    expect(fetch).not.toHaveBeenCalledWith("/api/market/features", expect.anything());
  });

  it("shows login form when the API call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: "Authentification requise." })
      })
    );
    renderApp();
    await waitFor(() => {
      expect(screen.getByText("Connexion")).toBeInTheDocument();
    });
  });
});
