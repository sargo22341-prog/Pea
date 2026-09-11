import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAsync } from "../../hooks/useAsync";

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
    await waitFor(() => expect(result.current.data).toBe("first"));
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
    await waitFor(() => expect(result.current.data).toBe("day"));

    rerender({ range: "1w" });
    await waitFor(() => expect(result.current.loading).toBe(true));

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
      .mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(() => useAsync(loader));
    await waitFor(() => expect(result.current.error).toBe("boom"));

    act(() => {
      void result.current.reload();
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
  });
});
