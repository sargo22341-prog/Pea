import { getNativeAuthToken, getNativeServerUrl, getServerUrlDetails, isNativeApp, resolveServerPath } from "./native-auth";

export const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

const inFlightRequests = new Map<string, Promise<unknown>>();
const maxInFlightRequests = 500;
const defaultRequestTimeoutMs = 20_000;

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;
  readonly raw?: unknown;

  constructor(status: number, message: string, options: { details?: unknown; raw?: unknown } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = options.details;
    this.raw = options.raw;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function abortError() {
  return new DOMException("Requete annulee", "AbortError");
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      signal.addEventListener("abort", () => reject(abortError()), { once: true });
    })
  ]);
}

/**
 * Déduplique les requêtes concurrentes vers le même endpoint+paramètres.
 *
 * IMPORTANT : la clé de déduplication est `path` *avec* sa query string. Tous les callers
 * (`portfolio-api.ts`, `market-api.ts`) construisent déjà le path complet
 * (ex: `/api/portfolio?range=1d`). Si on s'attend à dédupliquer deux paramétrisations
 * différentes du même endpoint, elles auront naturellement deux clés distinctes.
 *
 * Le `signal` ne propage pas l'abort à la promesse partagée — un caller qui abort ne tue pas
 * le fetch ni les autres callers en attente. C'est volontaire : il s'agit d'éviter le wasted
 * fetch, pas de coordonner des cancellations.
 */
export function dedupedRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  let existing = inFlightRequests.get(path) as Promise<T> | undefined;
  if (!existing) {
    if (inFlightRequests.size >= maxInFlightRequests) {
      return Promise.reject(new Error("Trop de requetes en cours."));
    }
    existing = request<T>(path).finally(() => {
      inFlightRequests.delete(path);
    });
    inFlightRequests.set(path, existing);
  }

  return withAbort(existing, signal);
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await requestHeaders(init);
  const url = await resolveApiUrl(path);
  logNativeRequest(path, url);
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      ...init,
      headers,
      credentials: "include"
    });
  } catch (error) {
    logNativeNetworkError(path, url, error);
    throw createNetworkApiError(error, url);
  }
  logNativeResponse(path, response);

  if (!response.ok) {
    const rawText = await response.text().catch(() => "");
    let body: unknown;
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      body = rawText;
    }
    const payload = body && typeof body === "object" ? body as { message?: unknown; details?: unknown } : {};
    const message = typeof payload.message === "string" && payload.message.trim()
      ? payload.message
      : `Erreur API ${response.status}`;
    throw new ApiError(response.status, message, { details: payload.details, raw: body });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  const headers = await requestHeaders(init);
  const url = await resolveApiUrl(path);
  logNativeRequest(path, url);
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      ...init,
      headers,
      credentials: "include"
    });
  } catch (error) {
    logNativeNetworkError(path, url, error);
    throw createNetworkApiError(error, url);
  }
  logNativeResponse(path, response);

  if (!response.ok) {
    const message = response.status === 401 ? "Authentification requise." : `Erreur API ${response.status}`;
    throw new ApiError(response.status, message);
  }

  return response.blob();
}

export function apiUrl(path: string) {
  return `${baseUrl}${path}`;
}

export async function resolveApiUrl(path: string) {
  if (!isNativeApp()) return apiUrl(path);
  const serverUrl = await getNativeServerUrl();
  if (!serverUrl) throw new ApiError(0, "URL serveur non configuree.");
  return resolveServerPath(serverUrl, path);
}

function logNativeRequest(path: string, url: string) {
  if (!isNativeApp()) return;
  const details = getServerUrlDetails(url);
  console.info("[pea:api] request", { path, url, protocol: details.protocol, hostname: details.hostname });
}

function logNativeResponse(path: string, response: Response) {
  if (!isNativeApp()) return;
  console.info("[pea:api] response", { path, status: response.status, ok: response.ok, url: response.url });
}

function logNativeNetworkError(path: string, url: string, error: unknown) {
  if (!isNativeApp()) return;
  console.error("[pea:api] network error", { path, url, ...describeNetworkError(error) });
}

export function describeNetworkError(error: unknown) {
  if (!(error instanceof Error)) {
    return { name: "UnknownError", message: String(error) };
  }

  const causeValue = (error as Error & { cause?: unknown }).cause;
  const cause = causeValue instanceof Error
    ? { causeName: causeValue.name, causeMessage: causeValue.message }
    : {};
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...cause
  };
}

function createNetworkApiError(error: unknown, url: string) {
  const details = describeNetworkError(error);
  const causeMessage = "causeMessage" in details ? details.causeMessage : "";
  const text = `${details.message ?? ""} ${causeMessage}`;
  const isTimeout = details.name === "AbortError" || /timeout|timed out|aborted/i.test(text);
  const isSsl = /ssl|cert|certificate|trust|authority|handshake|ERR_CERT/i.test(text);
  const parsed = getServerUrlDetails(url);

  const message = isTimeout
    ? `Timeout reseau apres ${defaultRequestTimeoutMs / 1000}s vers ${parsed.hostname}.`
    : isSsl
      ? `Erreur SSL/certificat vers ${parsed.hostname}. Verifiez que le certificat racine est installe et autorise pour les apps Android.`
      : `Serveur inaccessible depuis l'application (${parsed.protocol}//${parsed.hostname}). Detail: ${details.message || "erreur reseau inconnue"}`;

  return new ApiError(0, message, {
    details: {
      url,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      timeoutMs: defaultRequestTimeoutMs,
      ...details
    }
  });
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = defaultRequestTimeoutMs) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(new DOMException("Timeout reseau", "AbortError")), timeoutMs);
  const signal = init.signal;

  if (signal?.aborted) {
    window.clearTimeout(timeout);
    throw abortError();
  }

  const abort = () => controller.abort(signal?.reason ?? abortError());
  signal?.addEventListener("abort", abort, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export async function requestHeaders(init?: RequestInit): Promise<HeadersInit | undefined> {
  const headers = new Headers(init?.headers);
  let hasHeaders = Boolean(init?.headers);

  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
    hasHeaders = true;
  }

  if (isNativeApp()) {
    headers.set("X-PEA-Auth-Mode", "bearer");
    hasHeaders = true;
    const token = await getNativeAuthToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  return hasHeaders ? headers : undefined;
}
