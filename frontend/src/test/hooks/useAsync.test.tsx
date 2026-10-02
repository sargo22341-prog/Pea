import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAsync } from "../../hooks/useAsync";
import { clearAsyncDataCache } from "../../lib/cache/async-data-cache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useAsync", () => {
  it("keeps data visible and loading false during a manual reload", async () => {
    const second = deferred<string>();
    const loader = vi.fn()
      .mockResolvedValueOnce("first")
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useAsync(loader));
    await waitFor(() => { expect(result.current.data).toBe("first"); });
    expect(result.current.loading).toBe(false);

    let reloading!: Promise<void>;
    act(() => {
      reloading = result.current.reload();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe("first");

    await act(async () => {
      second.resolve("second");
      await reloading;
    });
    expect(result.current.data).toBe("second");
    expect(result.current.loading).toBe(false);
  });

  it("still shows loading when the reload key changes", async () => {
    const pending = deferred<string>();
    const loader = vi.fn((key: string) => (key === "1d" ? Promise.resolve("day") : pending.promise));

    const { result, rerender } = renderHook(({ range }) => useAsync(() => loader(range), range), {
      initialProps: { range: "1d" }
    });
    await waitFor(() => { expect(result.current.data).toBe("day"); });

    rerender({ range: "1w" });
    await waitFor(() => { expect(result.current.loading).toBe(true); });

    await act(async () => {
      pending.resolve("week");
      await pending.promise;
    });
    expect(result.current.data).toBe("week");
    expect(result.current.loading).toBe(false);
  });

  it("shows loading on a reload triggered before the first load succeeded", async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockReturnValueOnce(new Promise(() => undefined));

    const { result } = renderHook(() => useAsync(loader));
    await waitFor(() => { expect(result.current.error).toBe("boom"); });

    act(() => {
      void result.current.reload();
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("shows the last response of a revisited page at once, then refreshes it", async () => {
    const first = renderHook(() => useAsync(() => Promise.resolve("v1"), undefined, { cacheKey: "page" }));
    await waitFor(() => { expect(first.result.current.data).toBe("v1"); });
    first.unmount();

    const refresh = deferred<string>();
    const revisit = renderHook(() => useAsync(() => refresh.promise, undefined, { cacheKey: "page" }));
    expect(revisit.result.current.loading).toBe(false);
    expect(revisit.result.current.data).toBe("v1");

    await act(async () => {
      refresh.resolve("v2");
      await refresh.promise;
    });
    expect(revisit.result.current.data).toBe("v2");
  });

  it("uses the cached response of the new parameters when the reload key changes", async () => {
    const pendingWeek = deferred<string>();
    const loader = vi.fn((range: string) => (range === "1d" ? Promise.resolve("day") : pendingWeek.promise));
    const { result, rerender } = renderHook(({ range }) => useAsync(() => loader(range), range, { cacheKey: `chart:${range}` }), {
      initialProps: { range: "1d" }
    });
    await waitFor(() => { expect(result.current.data).toBe("day"); });

    rerender({ range: "1w" });
    expect(result.current.loading).toBe(true);
    await act(async () => {
      pendingWeek.resolve("week");
      await pendingWeek.promise;
    });

    rerender({ range: "1d" });
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe("day");
  });

  it("does not keep a response once the cache is cleared at logout", async () => {
    const first = renderHook(() => useAsync(() => Promise.resolve("private"), undefined, { cacheKey: "account" }));
    await waitFor(() => { expect(first.result.current.data).toBe("private"); });
    first.unmount();
    clearAsyncDataCache();

    const next = renderHook(() => useAsync(() => new Promise<string>(() => undefined), undefined, { cacheKey: "account" }));
    expect(next.result.current.loading).toBe(true);
    expect(next.result.current.data).toBeNull();
  });
});
