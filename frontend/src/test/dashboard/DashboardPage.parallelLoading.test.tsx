import type { User } from "@pea/shared";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../../pages/dashboard/DashboardPage";

const portfolioFull = vi.fn<(range: string, signal?: AbortSignal) => Promise<unknown>>();
const positionsPerformance = vi.fn<(range: string) => Promise<unknown>>();
const watchlist = vi.fn<(range: string) => Promise<unknown>>();

vi.mock("../../lib/api", () => ({
  api: {
    portfolioFull: (range: string, signal?: AbortSignal) => portfolioFull(range, signal),
    positionsPerformance: (range: string) => positionsPerformance(range),
    watchlist: (range: string) => watchlist(range),
    requestChartRefresh: () => Promise.resolve({ status: "skipped" })
  }
}));

const user = { id: 1, username: "tester", defaultChartRange: "1m", dashboardDefaultSortKey: "name", dashboardDefaultSortDirection: "asc", watchlistDefaultSortKey: "name", watchlistDefaultSortDirection: "asc", localPeaSearchEnabled: false } as unknown as User;

describe("DashboardPage parallel loading", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requests positions performance and watchlist without waiting for the portfolio chart", async () => {
    portfolioFull.mockReturnValue(new Promise(() => undefined));
    positionsPerformance.mockResolvedValue([]);
    watchlist.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <DashboardPage appTimezone="Europe/Paris" user={user} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(positionsPerformance).toHaveBeenCalledWith("1m");
    });
    expect(watchlist).toHaveBeenCalledWith("1m");
    expect(portfolioFull).toHaveBeenCalledTimes(1);
  });

  it("ignores a failed prefetch so the owning section can report its own error", async () => {
    portfolioFull.mockReturnValue(new Promise(() => undefined));
    positionsPerformance.mockRejectedValue(new Error("offline"));
    watchlist.mockRejectedValue(new Error("offline"));

    render(
      <MemoryRouter>
        <DashboardPage appTimezone="Europe/Paris" user={user} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(watchlist).toHaveBeenCalledTimes(1);
    });
  });
});
