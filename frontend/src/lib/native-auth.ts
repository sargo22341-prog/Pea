import { Capacitor, registerPlugin } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";

const authTokenKey = "pea.auth.sessionToken";
const serverUrlKey = "pea.server.url";
const peaNetwork = registerPlugin<{ setBackendUrl(options: { url: string }): Promise<{ ok: boolean }> }>("PEANetwork");

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function getNativeAuthToken() {
  if (!isNativeApp()) return undefined;
  const token = await SecureStorage.getItem(authTokenKey);
  return token?.trim() || undefined;
}

export async function setNativeAuthToken(token: string) {
  if (!isNativeApp()) return;
  await SecureStorage.setItem(authTokenKey, token);
}

export async function clearNativeAuthToken() {
  if (!isNativeApp()) return;
  await SecureStorage.removeItem(authTokenKey);
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
  const url = await SecureStorage.getItem(serverUrlKey);
  const normalized = url?.trim() || undefined;
  if (normalized) await configureNativeBackendUrl(normalized);
  return normalized;
}

export async function setNativeServerUrl(url: string) {
  if (!isNativeApp()) return;
  const normalized = normalizeServerUrl(url);
  await SecureStorage.setItem(serverUrlKey, normalized);
  await configureNativeBackendUrl(normalized);
}

export async function clearNativeServerUrl() {
  if (!isNativeApp()) return;
  await SecureStorage.removeItem(serverUrlKey);
}

export async function configureNativeBackendUrl(url: string) {
  if (!isNativeApp()) return;
  await peaNetwork.setBackendUrl({ url: normalizeServerUrl(url) }).catch((error) => {
    console.error("[pea:network] failed to configure native backend URL", { url, error });
  });
}
