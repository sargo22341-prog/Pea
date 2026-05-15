import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RuntimeHealthDto } from "@pea/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeHealthSection } from "../pages/admin/components/RuntimeHealthSection";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    getRuntimeHealth: vi.fn()
  }
}));

const basePayload: RuntimeHealthDto = {
  generatedAt: "2026-05-14T13:00:00.000Z",
  cache: {
    cacheEntries: {
      totalRows: 12,
      expiredRows: 2,
      byScope: [
        { scope: "quote", rows: 8, expiredRows: 1 },
        { scope: "news", rows: 4, expiredRows: 1 }
      ]
    },
    derivedCaches: {
      portfolioChartCacheRows: 3,
      portfolioPositionsPerformanceCacheRows: 4,
      frontendBlockCacheRows: 5
    },
    cleanup: {
      lastRunAt: "2026-05-14T12:55:00.000Z",
      durationMs: 15,
      deletedRows: { cache_entries: 1 },
      totalDeletedRows: 1
    }
  },
  memory: {
    intradayChartCacheEntries: 10,
    intradayRefreshInFlight: 1,
    snapshotQuoteCacheEntries: 11,
    previousOpenMarketDaysCacheEntries: 12,
    backendInFlightRequests: 2,
    yahooSearchCacheEntries: 6,
    yahooQuoteCombineCacheEntries: 7,
    rateLimitBuckets: 9,
    authFailureEntries: 3,
    sseClients: 4
  },
  queue: {
    pending: 1,
    running: 2,
    failed: 0,
    completed: 10,
    oldestPendingAgeMs: 4_000,
    oldestRunningAgeMs: 5_000,
    activeWorkers: 2,
    maxConcurrentTasks: 4,
    busySymbols: 1,
    byTypePriority: [
      { type: "candles", priority: 30, pending: 1, running: 1, failed: 0, completed: 8 }
    ]
  },
  scheduler: {
    lastTickAt: "2026-05-14T12:59:00.000Z",
    lastTickDurationMs: 25,
    lastSuccessAt: "2026-05-14T12:59:01.000Z",
    lastError: null,
    lockOwner: null,
    heartbeatAgeMs: undefined,
    trackedMarkets: 2,
    nextTickAt: "2026-05-14T13:05:00.000Z",
    running: false,
    status: "healthy"
  },
  yahoo: {
    circuitBreaker: {
      state: "closed",
      failureCount: 0,
      openedAt: null,
      nextAttemptAt: null
    },
    recentCalls24h: 42,
    recentErrors: [],
    backendInFlightRequests: 2,
    searchCacheEntries: 6,
    quoteCombineCacheEntries: 7
  }
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function openRuntimeMonitoring() {
  fireEvent.click(screen.getByRole("button", { name: /monitoring runtime/i }));
}

describe("RuntimeHealthSection", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("affiche le chargement puis les donnees runtime", async () => {
    const request = deferred<RuntimeHealthDto>();
    vi.mocked(api.getRuntimeHealth).mockReturnValue(request.promise);

    render(<RuntimeHealthSection />);

    expect(screen.queryByText("Chargement...")).not.toBeInTheDocument();
    openRuntimeMonitoring();
    expect(screen.getByText("Chargement...")).toBeInTheDocument();
    request.resolve(basePayload);

    await waitFor(() => expect(screen.getByText("Scheduler healthy")).toBeInTheDocument());
    expect(screen.getByText("cache_entries")).toBeInTheDocument();
    expect(screen.getByText("intradayChartCache")).toBeInTheDocument();
    expect(screen.getByText("Circuit breaker")).toBeInTheDocument();
  });

  it("affiche une erreur API proprement", async () => {
    vi.mocked(api.getRuntimeHealth).mockRejectedValue(new Error("Runtime indisponible"));

    render(<RuntimeHealthSection />);
    openRuntimeMonitoring();

    expect(await screen.findByText("Runtime indisponible")).toBeInTheDocument();
  });

  it("affiche les badges warning et error", async () => {
    vi.mocked(api.getRuntimeHealth).mockResolvedValue({
      ...basePayload,
      queue: { ...basePayload.queue, failed: 3, oldestRunningAgeMs: 40 * 60_000 },
      scheduler: { ...basePayload.scheduler, status: "warning" },
      yahoo: { ...basePayload.yahoo, circuitBreaker: { ...basePayload.yahoo.circuitBreaker, state: "open", failureCount: 5 } },
      memory: { ...basePayload.memory, sseClients: 90, authFailureEntries: 1_500 },
      cache: { ...basePayload.cache, cacheEntries: { ...basePayload.cache.cacheEntries, expiredRows: 2_000 } }
    });

    render(<RuntimeHealthSection />);
    openRuntimeMonitoring();

    await waitFor(() => expect(screen.getAllByText("Scheduler warning").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Yahoo open").length).toBeGreaterThan(0);
    expect(screen.getByText("3 taches en erreur")).toBeInTheDocument();
    expect(screen.getByText("SSE proche limite")).toBeInTheDocument();
  });

  it("le bouton refresh rappelle l'API", async () => {
    vi.mocked(api.getRuntimeHealth).mockResolvedValue(basePayload);

    render(<RuntimeHealthSection />);
    openRuntimeMonitoring();

    await screen.findByText("Scheduler healthy");
    fireEvent.click(screen.getByRole("button", { name: /rafraichir/i }));

    await waitFor(() => expect(api.getRuntimeHealth).toHaveBeenCalledTimes(2));
  });
});
