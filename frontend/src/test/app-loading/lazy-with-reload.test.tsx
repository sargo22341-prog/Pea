import { act, render, screen } from "@testing-library/react";
import { Component, Suspense, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHUNK_RETRY_DELAYS_MS, lazyWithReload } from "../../lib/app-loading/lazy-with-reload";
import { reloadPage } from "../../lib/app-loading/page-reload";

vi.mock("../../lib/app-loading/page-reload", () => ({ reloadPage: vi.fn() }));

const RELOAD_KEY = "pea:chunk-reload-at";
const TOTAL_RETRY_DELAY_MS = CHUNK_RETRY_DELAYS_MS.reduce((total, delay) => total + delay, 0);

class TestBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    return this.state.error ? <p>boundary: {this.state.error.message}</p> : this.props.children;
  }
}

function renderLazy(factory: () => Promise<{ default: () => ReactNode }>) {
  const Page = lazyWithReload(factory);
  return render(
    <TestBoundary>
      <Suspense fallback={<p>loading</p>}>
        <Page />
      </Suspense>
    </TestBoundary>
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("lazyWithReload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(reloadPage).mockClear();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries a transient chunk failure in place instead of showing the error screen", async () => {
    const factory = vi
      .fn<() => Promise<{ default: () => ReactNode }>>()
      .mockRejectedValueOnce(new TypeError("error loading dynamically imported module"))
      .mockResolvedValue({ default: () => <p>dashboard</p> });

    renderLazy(factory);
    await advance(CHUNK_RETRY_DELAYS_MS[0]);

    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull();
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it("reloads the page once after every retry failed", async () => {
    const factory = vi.fn().mockRejectedValue(new TypeError("chunk missing"));

    renderLazy(factory);
    await advance(TOTAL_RETRY_DELAY_MS);

    expect(factory).toHaveBeenCalledTimes(CHUNK_RETRY_DELAYS_MS.length + 1);
    expect(Number(sessionStorage.getItem(RELOAD_KEY))).toBe(Date.now());
    expect(reloadPage).toHaveBeenCalledOnce();
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.queryByText(/boundary/)).not.toBeInTheDocument();
  });

  it("surfaces the error when a reload already happened during the cooldown", async () => {
    const previousReloadAt = String(Date.now());
    sessionStorage.setItem(RELOAD_KEY, previousReloadAt);
    const factory = vi.fn().mockRejectedValue(new TypeError("chunk missing"));

    renderLazy(factory);
    await advance(TOTAL_RETRY_DELAY_MS);

    expect(sessionStorage.getItem(RELOAD_KEY)).toBe(previousReloadAt);
    expect(reloadPage).not.toHaveBeenCalled();
    expect(screen.getByText("boundary: chunk missing")).toBeInTheDocument();
  });
});
