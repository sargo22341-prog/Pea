import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function abortListeners(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter(([type]) => type === "abort").map(([, listener]) => listener);
}

describe("deduped requests and abort signals", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("releases the abort listener once the shared request settles", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([{ id: 1 }])));
    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, "addEventListener");
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

    await expect(api.positionsPerformance("1d", controller.signal)).resolves.toEqual([{ id: 1 }]);

    const listeners = abortListeners(addSpy);
    expect(listeners.length).toBeGreaterThan(0);
    for (const listener of listeners) {
      expect(removeSpy).toHaveBeenCalledWith("abort", listener);
    }
  });

  it("still rejects an aborted caller without cancelling the other waiting caller", async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    })));
    const controller = new AbortController();

    const aborted = api.positionsPerformance("1w", controller.signal);
    const other = api.positionsPerformance("1w");
    controller.abort();

    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    resolveFetch(jsonResponse([{ id: 2 }]));
    await expect(other).resolves.toEqual([{ id: 2 }]);
  });
});
