import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init
  });
}

describe("api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("dedupes concurrent GET requests for the same portfolio resource", async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    const fetchSpy = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const first = api.portfolio("1d");
    const second = api.portfolio("1d");
    resolveFetch(jsonResponse({ assetsCount: 0 }));

    await expect(first).resolves.toEqual({ assetsCount: 0 });
    await expect(second).resolves.toEqual({ assetsCount: 0 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("/api/portfolio?range=1d", expect.objectContaining({ credentials: "include" }));
  });

  it("turns non-ok JSON responses into the backend message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Session expiree" }, { status: 401 })));

    await expect(api.me()).rejects.toThrow("Session expiree");
  });

  it("returns undefined for 204 responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(api.logout()).resolves.toBeUndefined();
  });

  it("does not force JSON content type for FormData uploads", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ id: 1, username: "alice" }));
    vi.stubGlobal("fetch", fetchSpy);

    await api.uploadProfileIcon(new File(["avatar"], "avatar.jpg", { type: "image/jpeg" }));

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toBeUndefined();
  });
});

