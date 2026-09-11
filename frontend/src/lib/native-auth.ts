import { Capacitor, registerPlugin } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";

const authTokenKey = "pea.auth.sessionToken";
const serverUrlKey = "pea.server.url";
const peaNetwork = registerPlugin<{ setBackendUrl(options: { url: string }): Promise<{ ok: boolean }> }>("PEANetwork");

// Caches mémoire : SecureStorage et le plugin réseau passent par le pont natif Capacitor,
// trop coûteux pour être sollicités à chaque requête API. Les setters/clear les tiennent à jour.
let authTokenCache: Promise<string | undefined> | undefined;
let serverUrlCache: Promise<string | undefined> | undefined;
let backendUrlConfiguration: { url: string; ready: Promise<void> } | undefined;

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

async function readCachedItem(cache: Promise<string | undefined>, reset: () => void) {
  try {
    return await cache;
  } catch (error) {
    reset();
    throw error;
  }
}

export async function getNativeAuthToken() {
  if (!isNativeApp()) return undefined;
  authTokenCache ??= SecureStorage.getItem(authTokenKey).then((token) => token?.trim() || undefined);
  return readCachedItem(authTokenCache, () => {
    authTokenCache = undefined;
  });
}

export async function setNativeAuthToken(token: string) {
  if (!isNativeApp()) return;
  await SecureStorage.setItem(authTokenKey, token);
  authTokenCache = Promise.resolve(token.trim() || undefined);
}

export async function clearNativeAuthToken() {
  if (!isNativeApp()) return;
  await SecureStorage.removeItem(authTokenKey);
  authTokenCache = Promise.resolve(undefined);
}

export function normalizeServerUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("URL serveur requise.");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("URL serveur invalide.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("L'URL serveur doit commencer par http:// ou https://.");
  }

  if (!parsed.hostname.trim()) {
    throw new Error("L'URL serveur doit contenir un hostname valide.");
  }

  return `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname}`;
}

export function getServerUrlDetails(value: string) {
  const parsed = new URL(normalizeServerUrl(value));
  return {
    url: parsed.toString().replace(/\/$/, ""),
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || undefined,
    pathname: parsed.pathname === "/" ? "" : parsed.pathname
  };
}

export function resolveServerPath(serverUrl: string, path: string) {
  const details = getServerUrlDetails(serverUrl);
  const basePath = details.pathname.replace(/\/+$/, "");
  let nextPath = path.startsWith("/") ? path : `/${path}`;

  if (basePath.toLowerCase().endsWith("/api") && nextPath.toLowerCase().startsWith("/api/")) {
    nextPath = nextPath.slice(4);
  }

  return `${details.url}${nextPath}`;
}

export function isInsecureServerUrl(value: string) {
  try {
    return new URL(normalizeServerUrl(value)).protocol === "http:";
  } catch {
    return false;
  }
}

export async function getNativeServerUrl() {
  if (!isNativeApp()) return undefined;
  serverUrlCache ??= SecureStorage.getItem(serverUrlKey).then((url) => url?.trim() || undefined);
  const normalized = await readCachedItem(serverUrlCache, () => {
    serverUrlCache = undefined;
  });
  if (normalized) await ensureNativeBackendUrl(normalized);
  return normalized;
}

export async function setNativeServerUrl(url: string) {
  if (!isNativeApp()) return;
  const normalized = normalizeServerUrl(url);
  await SecureStorage.setItem(serverUrlKey, normalized);
  serverUrlCache = Promise.resolve(normalized);
  await ensureNativeBackendUrl(normalized);
}

export async function clearNativeServerUrl() {
  if (!isNativeApp()) return;
  await SecureStorage.removeItem(serverUrlKey);
  serverUrlCache = Promise.resolve(undefined);
}

/**
 * Configure le plugin natif une seule fois par URL (et non à chaque requête).
 * En cas d'échec, la configuration est retentée au prochain appel.
 */
function ensureNativeBackendUrl(url: string) {
  if (backendUrlConfiguration?.url === url) return backendUrlConfiguration.ready;
  const ready = configureNativeBackendUrl(url).then((configured) => {
    if (!configured && backendUrlConfiguration?.ready === ready) backendUrlConfiguration = undefined;
  });
  backendUrlConfiguration = { url, ready };
  return ready;
}

export async function configureNativeBackendUrl(url: string) {
  if (!isNativeApp()) return false;
  try {
    await peaNetwork.setBackendUrl({ url: normalizeServerUrl(url) });
    return true;
  } catch (error) {
    console.error("[pea:network] failed to configure native backend URL", { url, error });
    return false;
  }
}
