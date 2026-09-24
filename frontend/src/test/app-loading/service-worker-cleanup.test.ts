import { afterEach, describe, expect, it, vi } from "vitest";
import { unregisterServiceWorkers } from "../../lib/app-loading/service-worker-cleanup";
import swSource from "../../../public/sw.js?raw";

type Listener = (event: { waitUntil: (promise: Promise<unknown>) => void }) => void;

function loadRetiredServiceWorker() {
  const listeners = new Map<string, Listener>();
  const scope = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: vi.fn(),
    registration: { unregister: vi.fn().mockResolvedValue(true) }
  };
  const caches = {
    keys: vi.fn().mockResolvedValue(["pea-portfolio-v4", "pea-portfolio-v3"]),
    delete: vi.fn().mockResolvedValue(true)
  };
  new Function("self", "caches", swSource)(scope, caches);
  return { listeners, scope, caches };
}

describe("retired service worker", () => {
  it("never intercepts requests", () => {
    const { listeners } = loadRetiredServiceWorker();
    expect(listeners.has("fetch")).toBe(false);
  });

  it("activates immediately, purges every cache and unregisters itself", async () => {
    const { listeners, scope, caches } = loadRetiredServiceWorker();
    listeners.get("install")?.({ waitUntil: () => undefined });
    expect(scope.skipWaiting).toHaveBeenCalled();

    let activation: Promise<unknown> | undefined;
    listeners.get("activate")?.({ waitUntil: (promise) => { activation = promise; } });
    await activation;

    expect(caches.delete.mock.calls.map(([key]) => key)).toEqual(["pea-portfolio-v4", "pea-portfolio-v3"]);
    expect(scope.registration.unregister).toHaveBeenCalledTimes(1);
  });
});

describe("unregisterServiceWorkers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("unregisters every existing registration", async () => {
    const registrations = [{ unregister: vi.fn().mockResolvedValue(true) }, { unregister: vi.fn().mockResolvedValue(true) }];
    const container = { getRegistrations: vi.fn().mockResolvedValue(registrations) } as unknown as ServiceWorkerContainer;

    await unregisterServiceWorkers(container);

    for (const registration of registrations) expect(registration.unregister).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the browser has no service worker support", async () => {
    await expect(unregisterServiceWorkers(undefined)).resolves.toBeUndefined();
  });

  it("logs a cleanup failure instead of breaking the app start", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const container = { getRegistrations: vi.fn().mockRejectedValue(new Error("SecurityError")) } as unknown as ServiceWorkerContainer;

    await expect(unregisterServiceWorkers(container)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[app] service worker cleanup failed", expect.any(Error));
  });
});
