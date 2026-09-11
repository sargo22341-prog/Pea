import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const secureStorage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
}));
const setBackendUrl = vi.hoisted(() => vi.fn());

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({ setBackendUrl })
}));

vi.mock("@aparajita/capacitor-secure-storage", () => ({ SecureStorage: secureStorage }));

async function loadNativeAuth() {
  vi.resetModules();
  return import("../../lib/native-auth");
}

describe("native auth caches", () => {
  beforeEach(() => {
    secureStorage.getItem.mockImplementation(async (key: string) => (key === "pea.server.url" ? "https://pea.example" : "token-1"));
    secureStorage.setItem.mockResolvedValue(undefined);
    secureStorage.removeItem.mockResolvedValue(undefined);
    setBackendUrl.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads secure storage and configures the native backend only once across requests", async () => {
    const nativeAuth = await loadNativeAuth();

    await Promise.all([nativeAuth.getNativeServerUrl(), nativeAuth.getNativeServerUrl(), nativeAuth.getNativeAuthToken()]);
    await nativeAuth.getNativeServerUrl();
    await nativeAuth.getNativeAuthToken();

    expect(secureStorage.getItem).toHaveBeenCalledTimes(2);
    expect(setBackendUrl).toHaveBeenCalledTimes(1);
  });

  it("keeps the cached token in sync with login and logout", async () => {
    const nativeAuth = await loadNativeAuth();
    expect(await nativeAuth.getNativeAuthToken()).toBe("token-1");

    await nativeAuth.setNativeAuthToken("token-2");
    expect(await nativeAuth.getNativeAuthToken()).toBe("token-2");

    await nativeAuth.clearNativeAuthToken();
    expect(await nativeAuth.getNativeAuthToken()).toBeUndefined();
    expect(secureStorage.getItem).toHaveBeenCalledTimes(1);
  });

  it("reconfigures the native backend when the server URL changes or the plugin failed", async () => {
    setBackendUrl.mockRejectedValueOnce(new Error("bridge down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const nativeAuth = await loadNativeAuth();

    await nativeAuth.getNativeServerUrl();
    await nativeAuth.getNativeServerUrl();
    await nativeAuth.setNativeServerUrl("https://other.example/");

    expect(await nativeAuth.getNativeServerUrl()).toBe("https://other.example");
    expect(setBackendUrl.mock.calls.map(([options]) => options.url)).toEqual([
      "https://pea.example",
      "https://pea.example",
      "https://other.example"
    ]);
  });
});
