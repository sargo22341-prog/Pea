import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { ApiError, isApiError, request } from "../../lib/api-core";
import { isInsecureServerUrl, normalizeServerUrl, resolveServerPath } from "../../lib/native-auth";

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
    vi.useRealTimers();
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

  it("turns non-ok JSON responses into typed API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Session expiree", details: { reason: "expired" } }, { status: 401 })));

    await expect(api.me()).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: "Session expiree",
      details: { reason: "expired" }
    });
  });

  it("keeps ApiError compatible with Error checks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Trop de requetes" }, { status: 429 })));

    try {
      await api.me();
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
      expect(isApiError(error)).toBe(true);
      expect((error as ApiError).status).toBe(429);
    }
  });

  it("reports relative web API network failures without treating the server URL as invalid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Timeout reseau", "AbortError")));

    await expect(api.positionsPerformance("1d")).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      message: expect.stringContaining("Timeout reseau")
    });
    await expect(api.positionsPerformance("1d")).rejects.not.toMatchObject({
      message: expect.stringContaining("URL serveur invalide")
    });
  });

  it("retries transient network failures for GET requests", async () => {
    const fetchSpy = vi.fn()
      .mockRejectedValueOnce(new DOMException("connexion transitoire", "NetworkError"))
      .mockResolvedValueOnce(jsonResponse([{ id: 1 }]));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(api.positionsPerformance("1d")).resolves.toEqual([{ id: 1 }]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not retry mutating requests", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new DOMException("connexion transitoire", "NetworkError"));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(request("/api/test", { method: "POST", body: JSON.stringify({ ok: true }) })).rejects.toMatchObject({
      status: 0
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("reconnects web SSE after an EventSource error", async () => {
    vi.useFakeTimers();
    const instances: Array<{
      url: string;
      init?: EventSourceInit;
      onerror?: () => void;
      onopen?: () => void;
      addEventListener: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }> = [];
    class TestEventSource {
      onerror?: () => void;
      onopen?: () => void;
      addEventListener = vi.fn();
      close = vi.fn();
      constructor(public url: string, public init?: EventSourceInit) {
        instances.push(this);
      }
    }
    vi.stubGlobal("EventSource", TestEventSource);

    const subscription = api.subscribeMarketEvents(() => undefined);
    subscription.addEventListener("portfolio-chart-updated");
    expect(instances).toHaveLength(1);
    expect(instances[0].addEventListener).toHaveBeenCalledWith("portfolio-chart-updated", expect.any(Function));

    instances[0].onerror?.();
    expect(instances[0].close).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(instances).toHaveLength(2);
    expect(instances[1].url).toBe("/api/market/events");
    expect(instances[1].init).toEqual({ withCredentials: true });
    expect(instances[1].addEventListener).toHaveBeenCalledWith("portfolio-chart-updated", expect.any(Function));
    subscription.close();
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

  it("normalizes configurable native server URLs", () => {
    expect(normalizeServerUrl(" https://pea.nas.home/ ")).toBe("https://pea.nas.home");
    expect(normalizeServerUrl(" http://192.168.1.42:4000/ ")).toBe("http://192.168.1.42:4000");
    expect(normalizeServerUrl(" http://qsdqsd.dkjfnbvjkhdfnbgvkjdfnvb:4000/api/ ")).toBe("http://qsdqsd.dkjfnbvjkhdfnbgvkjdfnvb:4000/api");
    expect(normalizeServerUrl(" https://abc.def/pea/ ")).toBe("https://abc.def/pea");
    expect(() => normalizeServerUrl("ftp://pea.nas.home")).toThrow(/http/);
    expect(() => normalizeServerUrl("not a url")).toThrow(/invalide/);
  });

  it("builds API URLs without hardcoded domain restrictions", () => {
    expect(resolveServerPath("http://monserveur.local:4000", "/api/auth/me")).toBe("http://monserveur.local:4000/api/auth/me");
    expect(resolveServerPath("https://abc.def/pea", "/api/auth/me")).toBe("https://abc.def/pea/api/auth/me");
    expect(resolveServerPath("https://nas.custom/api", "/api/auth/me")).toBe("https://nas.custom/api/auth/me");
  });

  it("detects insecure local server URLs for non-blocking Android warnings", () => {
    expect(isInsecureServerUrl("http://192.168.1.42:4000")).toBe(true);
    expect(isInsecureServerUrl("https://pea.nas.home")).toBe(false);
  });
});
