import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { request } from "../../lib/api-core";

/** Fetch qui ne répond jamais et ne se termine que lorsque la requête est abandonnée. */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => { reject(init.signal?.reason as Error); });
  }));
}

describe("request timeouts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("aborts ordinary requests after the default delay", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());
    const pending = request("/api/portfolio/positions/1/transactions", { method: "POST", body: "{}" });
    const rejection = expect(pending).rejects.toMatchObject({ status: 0, message: expect.stringContaining("20s") as unknown });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejection;
  });

  it("gives imports a longer delay than ordinary requests", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());
    let settled = false;
    const pending = api.previewBoursorama("csv").finally(() => { settled = true; });
    const rejection = expect(pending).rejects.toMatchObject({ message: expect.stringContaining("300s") as unknown });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(240_000);
    await rejection;
  });
});
